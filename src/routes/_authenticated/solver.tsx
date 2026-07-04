import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BrainCircuit, ImagePlus, Loader2, Sparkles, X } from "lucide-react";
import { solveProblem, type SolverResponse } from "@/lib/beee.functions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CircuitDiagram } from "@/components/app/circuit-diagram";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/solver")({
  component: SolverPage,
});

const UNITS = [1, 2, 3, 4, 5, 6] as const;

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
          Type a question or upload a photo. Get step-by-step reasoning, formulas, and optional
          circuit diagram.
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

function SolutionCard({ result }: { result: SolverResponse }) {
  return (
    <article className="card-soft space-y-5 p-6 sm:p-8">
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

      {result.extracted_text && (
        <div className="rounded-xl border border-border bg-surface-muted p-3 text-sm">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            OCR extracted
          </div>
          <p className="text-foreground">{result.extracted_text}</p>
        </div>
      )}

      {result.question && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Question
          </div>
          <p className="mt-1 text-sm text-foreground">{result.question}</p>
        </div>
      )}

      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Step-by-step
        </div>
        <ol className="mt-3 space-y-3">
          {result.steps.map((s) => (
            <li key={s.step} className="flex gap-3">
              <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-border bg-surface-muted text-xs font-semibold text-foreground">
                {s.step}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-foreground">{s.description}</p>
                {s.expression && (
                  <pre className="mt-1 overflow-x-auto rounded-lg border border-border bg-surface-muted p-2 font-mono text-xs text-foreground">
                    {s.expression}
                  </pre>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>

      {result.formulas_used.length > 0 && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Formulas used
          </div>
          <ul className="mt-2 flex flex-wrap gap-2">
            {result.formulas_used.map((f, i) => (
              <li
                key={i}
                className="rounded-lg border border-border bg-surface-muted px-2.5 py-1 font-mono text-xs text-foreground"
              >
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.diagram && (
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Diagram
          </div>
          <p className="mb-2 text-sm text-muted-foreground">{result.diagram.description}</p>
          <CircuitDiagram diagram={result.diagram} />
        </div>
      )}

      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Final answer
        </div>
        <p className="mt-1 text-base font-semibold text-foreground">{result.final_answer}</p>
      </div>
    </article>
  );
}
