import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BrainCircuit, ImagePlus, Loader2, Sparkles, X } from "lucide-react";
import { solveProblem, type SolverResponse } from "@/lib/beee.functions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CircuitDiagram } from "@/components/app/circuit-diagram";
import { toast } from "sonner";
import katex from "katex";
import "katex/dist/katex.min.css";

export const Route = createFileRoute("/_authenticated/solver")({
  component: SolverPage,
});

const UNITS = [1, 2, 3, 4, 5, 6] as const;

// ── KaTeX renderer ────────────────────────────────────────────────────────────
// Renders a string that may contain inline LaTeX ($...$) or display LaTeX ($$...$$)
// mixed with plain text. Falls back to plain text if KaTeX throws.
function unescapeMarkdown(text: string): string {
  return text
    .replace(/\\_/g, "_")
    .replace(/\\\{/g, "{")
    .replace(/\\\}/g, "}")
    .replace(/\\\[/g, "[")
    .replace(/\\\]/g, "]")
    .replace(/\\\$/g, "$");
}

function preprocessLatex(text: string): string {
  const unescaped = unescapeMarkdown(text);
  if (unescaped.includes("$")) return unescaped;

  let processed = unescaped;
  // Wrap subscript patterns like R_1, V_in, V_A, I_branch, R_{eq}, R_{45}
  processed = processed.replace(/\b([A-Za-z]_\{?[A-Za-z0-9]+\}?)\b/g, "$$$1$");

  // Wrap backslash units like 1\,\k\Omega, 470\,\Omega, 20\,\V
  processed = processed.replace(/(\d+(?:\.\d+)?\s*\\,\s*\\[A-Za-z]+)/g, "$$$1$");
  processed = processed.replace(/(\d+(?:\.\d+)?\s*\\[A-Za-z]+)/g, "$$$1$");

  // Wrap stand-alone backslash commands (like \Omega, \approx, etc.)
  processed = processed.replace(/(\\[A-Za-z]+)/g, "$$$1$");

  return processed;
}

function MathText({ text }: { text: string }) {
  const processed = preprocessLatex(text);
  const parts = splitMath(processed);
  return (
    <>
      {parts.map((part, i) => {
        if (part.type === "text") return <span key={i}>{part.value}</span>;
        try {
          const html = katex.renderToString(part.value, {
            displayMode: part.type === "display",
            throwOnError: false,
            output: "html",
          });
          return (
            <span
              key={i}
              className={part.type === "display" ? "block my-1" : "inline"}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          );
        } catch {
          return <span key={i}>{part.value}</span>;
        }
      })}
    </>
  );
}

// Render a pure LaTeX string (no delimiters) in display mode
function MathDisplay({ latex }: { latex: string }) {
  const cleaned = unescapeMarkdown(latex).trim();
  try {
    const html = katex.renderToString(cleaned, {
      displayMode: true,
      throwOnError: false,
      output: "html",
    });
    return (
      <span
        className="block overflow-x-auto"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  } catch {
    return <code className="text-xs">{cleaned}</code>;
  }
}

// Render a pure LaTeX string inline
function MathInline({ latex }: { latex: string }) {
  const cleaned = unescapeMarkdown(latex).trim();
  try {
    const html = katex.renderToString(cleaned, {
      displayMode: false,
      throwOnError: false,
      output: "html",
    });
    return (
      <span dangerouslySetInnerHTML={{ __html: html }} />
    );
  } catch {
    return <code className="text-xs">{cleaned}</code>;
  }
}

type MathPart =
  | { type: "text"; value: string }
  | { type: "inline"; value: string }
  | { type: "display"; value: string };

function splitMath(raw: string): MathPart[] {
  const parts: MathPart[] = [];
  // Match $$...$$ first, then $...$
  const regex = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(raw)) !== null) {
    if (match.index > last) {
      parts.push({ type: "text", value: raw.slice(last, match.index) });
    }
    const token = match[0];
    if (token.startsWith("$$")) {
      parts.push({ type: "display", value: token.slice(2, -2).trim() });
    } else {
      parts.push({ type: "inline", value: token.slice(1, -1).trim() });
    }
    last = match.index + token.length;
  }
  if (last < raw.length) parts.push({ type: "text", value: raw.slice(last) });
  return parts;
}

// Detect if a string looks like raw LaTeX (no $ delimiters) so we can render it
function looksLikeLatex(s: string): boolean {
  const unescaped = unescapeMarkdown(s);
  // Match common LaTeX commands or subscript/superscript patterns
  return /\\(?:frac|sqrt|sum|int|cdot|times|Omega|omega|alpha|beta|theta|phi|infty|left|right|text|mathrm|mathbf|begin|end|dfrac|tfrac|approx|leq|geq|pm|mp|Delta|partial|nabla|hat|bar|vec|,|;|quad|qquad)/.test(unescaped)
    || /[_^]\{/.test(unescaped)   // e.g. R_{eq} or x^{2}
    || /\\[A-Za-z]+/.test(unescaped); // any backslash command
}

// Smart expression renderer: handles $...$, raw LaTeX, and plain text
function ExpressionBlock({ expr }: { expr: string }) {
  const unescaped = unescapeMarkdown(expr);
  const hasDollar = /\$/.test(unescaped);
  if (hasDollar) {
    return (
      <div className="mt-1.5 overflow-x-auto rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm">
        <MathText text={unescaped} />
      </div>
    );
  }
  if (looksLikeLatex(unescaped)) {
    return (
      <div className="mt-1.5 overflow-x-auto rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm">
        <MathDisplay latex={unescaped} />
      </div>
    );
  }
  // Plain text / ASCII math
  return (
    <pre className="mt-1.5 overflow-x-auto rounded-lg border border-border bg-surface-muted p-2 font-mono text-xs text-foreground">
      {expr}
    </pre>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

function SolverPage() {
  const solve = useServerFn(solveProblem);
  const fileRef = useRef<HTMLInputElement>(null);
  const [unitNum, setUnitNum] = useState<number>(1);
  const [question, setQuestion] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [result, setResult] = useState<SolverResponse | null>(null);

  const mutation = useMutation({
    mutationFn: async (payload: {
      question?: string;
      unit_number?: number;
      imageDataUrl?: string;
    }) => solve({ data: payload }),
    onSuccess: (data) => setResult(data),
    onError: (err: Error) => toast.error(err.message ?? "Solver failed"),
  });

  const onPickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      toast.error("Image must be smaller than 4 MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImageDataUrl(String(reader.result));
    reader.readAsDataURL(file);
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const q = question.trim();
    if (!q && !imageDataUrl) {
      toast.error("Type a question or attach an image.");
      return;
    }
    setResult(null);
    mutation.mutate({
      unit_number: unitNum,
      question: q || undefined,
      imageDataUrl: imageDataUrl ?? undefined,
    });
  };

  return (
    <div className="space-y-8">
      <header>
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground shadow-soft">
          <BrainCircuit className="h-3.5 w-3.5 text-brand" />
          AI Problem Solver
        </div>
        <h1 className="mt-3 text-3xl font-bold text-foreground">Solve any BEEE problem</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Type a question or upload a photo. Get step-by-step reasoning, formulas, and circuit
          diagrams when the problem needs one.
        </p>
      </header>

      <form onSubmit={onSubmit} className="card-soft space-y-5 p-6 sm:p-8">
        <div className="space-y-2">
          <Label>Target Unit</Label>
          <div className="flex flex-wrap gap-2">
            {UNITS.map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setUnitNum(u)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  unitNum === u
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-surface text-muted-foreground hover:text-foreground"
                }`}
              >
                Unit {u}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="q">Problem statement</Label>
          <Textarea
            id="q"
            rows={5}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            maxLength={4000}
            placeholder="e.g. A series RLC circuit has R=10 Ω, L=50 mH, C=100 µF at 50 Hz, 50 V. Find impedance, current and power factor."
          />
        </div>

        <div className="space-y-2">
          <Label>Or upload an image (handwritten or printed)</Label>
          {imageDataUrl ? (
            <div className="relative overflow-hidden rounded-xl border border-border bg-surface-muted">
              <img
                src={imageDataUrl}
                alt="Problem preview"
                className="max-h-64 w-full object-contain"
              />
              <button
                type="button"
                onClick={() => {
                  setImageDataUrl(null);
                  if (fileRef.current) fileRef.current.value = "";
                }}
                aria-label="Remove image"
                className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full border border-border bg-background shadow-soft"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-surface-muted p-8 text-center text-sm text-muted-foreground transition-colors hover:border-brand hover:text-foreground">
              <ImagePlus className="h-6 w-6 text-brand" />
              <span>Click to upload · PNG/JPG · up to 4 MB</span>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={onPickImage}
                className="sr-only"
              />
            </label>
          )}
        </div>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">Solutions are saved to your dashboard.</p>
          <Button type="submit" className="rounded-full" disabled={mutation.isPending}>
            {mutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Solving...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Solve with AI
              </>
            )}
          </Button>
        </div>
      </form>

      {result && <SolutionCard result={result} />}
    </div>
  );
}

// ── Solution card ─────────────────────────────────────────────────────────────

function SolutionCard({ result }: { result: SolverResponse }) {
  const steps = Array.isArray(result.steps) ? result.steps : [];
  const formulas = Array.isArray(result.formulas_used) ? result.formulas_used : [];

  return (
    <article className="card-soft space-y-6 p-6 sm:p-8">
      {/* Header */}
      <header className="flex items-start justify-between gap-3">
        <div>
          {result.unit_number && (
            <span className="mr-2 rounded-full border border-border bg-secondary px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Unit {result.unit_number}
            </span>
          )}
          <span className="rounded-full border border-border bg-secondary px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {result.topic}
          </span>
          <h2 className="mt-2 text-xl font-bold text-foreground">Solution</h2>
        </div>
      </header>

      {/* OCR extracted text */}
      {result.extracted_text && (
        <div className="rounded-xl border border-border bg-surface-muted p-3 text-sm">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Extracted from image
          </div>
          <p className="text-foreground">{result.extracted_text}</p>
        </div>
      )}

      {/* Question */}
      {result.question && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Question
          </div>
          <p className="mt-1 text-sm text-foreground leading-relaxed"><MathText text={result.question} /></p>
        </div>
      )}

      {/* Steps */}
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Step-by-step solution
        </div>
        <ol className="mt-3 space-y-4">
          {steps.map((s) => (
            <li key={s.step} className="flex gap-3">
              <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-border bg-surface-muted text-xs font-semibold text-foreground">
                {s.step}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-foreground leading-relaxed"><MathText text={s.description} /></p>
                {s.expression && <ExpressionBlock expr={s.expression} />}
                {s.diagram && (
                  <div className="mt-3 overflow-hidden rounded-xl border border-border bg-surface p-4">
                    <p className="mb-2 text-xs text-muted-foreground italic">{s.diagram.description}</p>
                    <CircuitDiagram diagram={s.diagram} />
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>

      {/* Formulas used */}
      {formulas.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Formulas used
          </div>
          <div className="flex flex-wrap gap-2">
            {formulas.map((f, i) => (
              <span
                key={i}
                className="inline-flex items-center rounded-lg border border-border bg-surface-muted px-3 py-1.5 text-sm"
              >
                {looksLikeLatex(f) || f.includes("$") ? (
                  <MathInline latex={f.replace(/^\$|\$$/g, "")} />
                ) : (
                  <code className="font-mono text-xs">{f}</code>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Diagram */}
      {result.diagram && (
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Diagram
          </div>
          <p className="mb-2 text-sm text-muted-foreground italic">{result.diagram.description}</p>
          <CircuitDiagram diagram={result.diagram} />
        </div>
      )}

      {/* Final answer */}
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-5">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-primary">
          Final Answer
        </div>
        <div className="space-y-1.5">
          {result.final_answer.replace(/\\n/g, "\n").split("\n").map((line, i) => {
            const trimmed = line.trim();
            if (!trimmed) return null;
            const hasDollar = trimmed.includes("$");
            const isLatex = looksLikeLatex(trimmed);
            return (
              <p key={i} className="text-base font-semibold text-foreground leading-relaxed">
                {hasDollar ? (
                  // Mixed text + $...$ tokens
                  <MathText text={trimmed} />
                ) : isLatex ? (
                  // Raw LaTeX without $ delimiters — render inline directly
                  <MathInline latex={trimmed} />
                ) : (
                  trimmed
                )}
              </p>
            );
          })}
        </div>
      </div>
    </article>
  );
}
