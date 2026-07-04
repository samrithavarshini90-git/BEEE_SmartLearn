import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, ClipboardCheck, Loader2, XCircle } from "lucide-react";
import { getQuiz, submitQuizAttempt } from "@/lib/beee.functions";
import { Button } from "@/components/ui/button";
import { UnitTabs } from "@/components/app/unit-tabs";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/quiz")({
  component: QuizPage,
});

type Result = {
  correct: number;
  total: number;
  score: number;
  details: Array<{
    question: string;
    options: string[];
    selected_index: number;
    correct_index: number;
    is_correct: boolean;
    explanation: string | null;
    topic: string;
  }>;
};

function QuizPage() {
  const fetchQuiz = useServerFn(getQuiz);
  const submit = useServerFn(submitQuizAttempt);
  const qc = useQueryClient();

  const [unit, setUnit] = useState<number>(1);
  const [started, setStarted] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<Result | null>(null);

  const { data, isFetching, refetch } = useQuery({
    enabled: started,
    queryKey: ["quiz", unit, started],
    queryFn: () => fetchQuiz({ data: { unit_number: unit, count: 10 } }),
  });

  useEffect(() => {
    if (started && !startTime) setStartTime(Date.now());
  }, [started, startTime]);

  const mutation = useMutation({
    mutationFn: async () => {
      const secs = startTime ? Math.round((Date.now() - startTime) / 1000) : 0;
      const payload = {
        unit_number: unit,
        duration_seconds: secs,
        answers: Object.entries(answers).map(([question_id, selected_index]) => ({
          question_id,
          selected_index,
        })),
      };
      return submit({ data: payload });
    },
    onSuccess: (r) => {
      setResult(r as Result);
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["leaderboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const allAnswered = useMemo(
    () => (data ?? []).every((q) => answers[q.id] !== undefined),
    [data, answers],
  );

  const restart = () => {
    setStarted(false);
    setStartTime(null);
    setAnswers({});
    setResult(null);
  };

  if (!started) {
    return (
      <div className="space-y-8">
        <header>
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground shadow-soft">
            <ClipboardCheck className="h-3.5 w-3.5 text-brand" />
            Practice Quiz
          </div>
          <h1 className="mt-3 text-3xl font-bold text-foreground">Test yourself, unit by unit</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            10 syllabus MCQs per attempt. Instant scoring, detailed answer key, points toward the leaderboard.
          </p>
        </header>
        <div className="card-soft p-6">
          <div className="text-sm font-semibold text-foreground">Pick a unit</div>
          <div className="mt-3">
            <UnitTabs value={unit} onChange={(v) => setUnit(v ?? 1)} />
          </div>
          <Button className="mt-6 rounded-full" onClick={() => setStarted(true)}>
            Start Unit {unit} quiz
          </Button>
        </div>
      </div>
    );
  }

  if (result) {
    return (
      <div className="space-y-6">
        <div className="card-soft p-8 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-border bg-surface-muted">
            <span className="text-2xl font-bold text-foreground">{result.score}%</span>
          </div>
          <h2 className="mt-4 text-2xl font-bold text-foreground">
            {result.correct} / {result.total} correct
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Unit {unit} quiz complete</p>
          <div className="mt-4 flex justify-center gap-3">
            <Button variant="outline" className="rounded-full" onClick={restart}>
              Try another unit
            </Button>
            <Button
              className="rounded-full"
              onClick={() => {
                setAnswers({});
                setResult(null);
                setStartTime(Date.now());
                refetch();
              }}
            >
              Retake this unit
            </Button>
          </div>
        </div>
        <ol className="space-y-4">
          {result.details.map((d, i) => (
            <li key={i} className="card-soft p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="font-mono text-xs font-semibold text-muted-foreground">Q{i + 1}</span>
                  <p className="mt-1 text-sm font-medium text-foreground">{d.question}</p>
                </div>
                {d.is_correct ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                ) : (
                  <XCircle className="h-5 w-5 shrink-0 text-red-600" />
                )}
              </div>
              <ul className="mt-3 space-y-1.5">
                {d.options.map((opt, k) => {
                  const isCorrect = k === d.correct_index;
                  const isSelected = k === d.selected_index;
                  return (
                    <li
                      key={k}
                      className={`rounded-lg border px-3 py-2 text-sm ${
                        isCorrect
                          ? "border-emerald-500/50 bg-emerald-50 text-emerald-900"
                          : isSelected
                            ? "border-red-500/50 bg-red-50 text-red-900"
                            : "border-border bg-surface text-muted-foreground"
                      }`}
                    >
                      {opt}
                    </li>
                  );
                })}
              </ul>
              {d.explanation && (
                <p className="mt-3 rounded-lg border border-border bg-surface-muted p-3 text-xs text-muted-foreground">
                  <span className="mr-1 font-semibold uppercase tracking-wider text-foreground">Why:</span>
                  {d.explanation}
                </p>
              )}
            </li>
          ))}
        </ol>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Unit {unit} · Quiz</h1>
          <p className="text-sm text-muted-foreground">Select the best answer for each question.</p>
        </div>
        <Button variant="ghost" onClick={restart}>Cancel</Button>
      </header>

      {isFetching || !data ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-surface-muted" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <div className="card-soft p-10 text-center text-sm text-muted-foreground">
          No quiz questions for this unit yet.
        </div>
      ) : (
        <>
          <ol className="space-y-4">
            {data.map((q, i) => (
              <li key={q.id} className="card-soft p-5">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-foreground">
                    <span className="mr-2 font-mono text-xs text-muted-foreground">Q{i + 1}.</span>
                    {q.question}
                  </p>
                  <span className="shrink-0 rounded-full border border-border bg-secondary px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                    {q.topic}
                  </span>
                </div>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {(q.options as string[]).map((opt, k) => {
                    const selected = answers[q.id] === k;
                    return (
                      <li key={k}>
                        <button
                          type="button"
                          onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: k }))}
                          className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                            selected
                              ? "border-primary bg-primary/10 text-foreground"
                              : "border-border bg-surface hover:bg-surface-muted"
                          }`}
                        >
                          <span className="mr-2 font-mono text-xs text-muted-foreground">
                            {String.fromCharCode(65 + k)}.
                          </span>
                          {opt}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ol>
          <div className="sticky bottom-4 flex items-center justify-between rounded-full border border-border bg-surface p-2 pl-5 shadow-soft">
            <span className="text-sm text-muted-foreground">
              {Object.keys(answers).length} / {data.length} answered
            </span>
            <Button
              className="rounded-full"
              disabled={!allAnswered || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting
                </>
              ) : (
                "Submit quiz"
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
