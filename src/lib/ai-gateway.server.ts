// Server-only Cerebras AI Gateway helper for BEEE SmartLearn.
// Never import from client bundles.

const CEREBRAS_URL = "https://api.cerebras.ai/v1/chat/completions";
const DEFAULT_MODEL = "gpt-oss-120b";
const VISION_MODEL = "gemma-4-31b";

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

/**
 * callCerebrasVision – uses the dedicated vision API keys + gemma-4-31b model
 * to read an image (circuit diagram, question scan, etc.) and return raw text.
 * These keys are exclusively used for image scanning and should NOT be used for
 * any other purpose.
 *
 * @param imageDataUrl  A base64 data URL (data:image/...;base64,...)
 * @param prompt        Text instruction telling the model what to extract
 * @returns             Raw string response from the vision model
 */
export async function callCerebrasVision(
  imageDataUrl: string,
  prompt: string,
): Promise<string> {
  // Dedicated vision keys only (csk-ek49... and csk-eyh8...)
  let visionKeys: string[] = [];
  if (process.env.CEREBRAS_VISION_KEYS) {
    visionKeys = process.env.CEREBRAS_VISION_KEYS.split(",").map(k => k.trim()).filter(Boolean);
  }

  // Fall back to general keys if vision keys are not configured
  if (visionKeys.length === 0 && process.env.CEREBRAS_API_KEYS) {
    visionKeys = process.env.CEREBRAS_API_KEYS.split(",").map(k => k.trim()).filter(Boolean);
  }

  if (visionKeys.length === 0) {
    throw new Error("Missing CEREBRAS_VISION_KEYS in environment variables.");
  }

  const body = {
    model: VISION_MODEL,
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "user" as const,
        content: [
          {
            type: "text" as const,
            text: prompt,
          },
          {
            type: "image_url" as const,
            image_url: { url: imageDataUrl },
          },
        ],
      },
    ],
  };

  let lastError: Error | null = null;

  for (const key of visionKeys) {
    try {
      console.log(`[Vision API] Calling gemma-4-31b with key ${key.substring(0, 8)}...`);
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
        if (res.status === 402 || res.status === 429) {
          console.warn(`[Vision API] Key ${key.substring(0, 8)} failed with ${res.status}. Rotating...`);
          lastError = new Error(`Cerebras Vision ${res.status}: ${text.slice(0, 240)}`);
          continue;
        }
        throw new Error(`Cerebras Vision ${res.status}: ${text.slice(0, 240)}`);
      }

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content ?? "";
      console.log("[Vision API] Response received:", content.slice(0, 120));
      return content;
    } catch (err: any) {
      if (err.message.includes("Cerebras Vision 402") || err.message.includes("Cerebras Vision 429")) {
        lastError = err;
        continue;
      }
      throw err;
    }
  }

  throw lastError ?? new Error("All Cerebras Vision API keys failed.");
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
