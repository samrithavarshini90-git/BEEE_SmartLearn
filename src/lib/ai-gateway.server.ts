// Server-only Cerebras AI Gateway helper for BEEE SmartLearn.
// Never import from client bundles.

const CEREBRAS_URL = "https://api.cerebras.ai/v1/chat/completions";
const DEFAULT_MODEL = "gpt-oss-120b";

export interface AIMessageTextPart {
  type: "text";
  text: string;
}
export interface AIMessageImagePart {
  type: "image_url";
  image_url: { url: string };
}
export type AIMessageContent = string | Array<AIMessageTextPart | AIMessageImagePart>;

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: AIMessageContent;
}

export interface AICallOptions {
  messages: AIMessage[];
  model?: string;
  temperature?: number;
  responseJson?: boolean;
}

export async function callLovableAI({
  messages,
  model = DEFAULT_MODEL,
  temperature = 0.15,
  responseJson = false,
}: AICallOptions): Promise<string> {
  let keys: string[] = [];
  if (process.env.CEREBRAS_API_KEYS) {
    keys = process.env.CEREBRAS_API_KEYS.split(",").map(k => k.trim()).filter(Boolean);
  } else if (process.env.CEREBRAS_API_KEY) {
    keys = [process.env.CEREBRAS_API_KEY];
  }

  if (keys.length === 0) {
    throw new Error("Missing CEREBRAS_API_KEYS in environment variables.");
  }

  const body: Record<string, unknown> = {
    model,
    temperature,
    messages,
  };
  if (responseJson) {
    body.response_format = { type: "json_object" };
  }

  let lastError: Error | null = null;

  for (const key of keys) {
    try {
      const res = await fetch(CEREBRAS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${key}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        // If quota exceeded or rate limited, try the next key
        if (res.status === 402 || res.status === 429) {
          console.warn(`[AI Gateway] Key starting with ${key.substring(0, 8)} failed with ${res.status}. Rotating...`);
          lastError = new Error(`Cerebras gateway ${res.status}: ${text.slice(0, 240)}`);
          continue; 
        }
        throw new Error(`Cerebras gateway ${res.status}: ${text.slice(0, 240)}`);
      }

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      return data.choices?.[0]?.message?.content ?? "";
    } catch (err: any) {
      if (err.message.includes("Cerebras gateway 402") || err.message.includes("Cerebras gateway 429")) {
        lastError = err;
        continue;
      }
      throw err;
    }
  }

  // If all keys failed, throw the last error
  throw lastError ?? new Error("All Cerebras API keys failed.");
}

// Extract the first JSON object from a model response that may be wrapped
// in code fences or contain leading/trailing prose.
export function safeParseJson<T>(raw: string, fallback: T): T {
  if (!raw) return fallback;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : raw).trim();
  try {
    return JSON.parse(candidate) as T;
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1)) as T;
      } catch {
        return fallback;
      }
    }
    return fallback;
  }
}
