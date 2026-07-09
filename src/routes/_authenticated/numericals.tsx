import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Calculator } from "lucide-react";
import { listNumericals } from "@/lib/beee.functions";
import { UnitTabs } from "@/components/app/unit-tabs";

export const Route = createFileRoute("/_authenticated/numericals")({
  component: NumericalsPage,
});

function NumericalsPage() {
  const fetch = useServerFn(listNumericals);
  const [unit, setUnit] = useState<number | null>(1);
  const { data, isLoading } = useQuery({
    queryKey: ["numericals", unit],
    queryFn: () => fetch({ data: unit ? { unit_number: unit } : {} }),
  });

  return (
    <div className="space-y-8">
      <header>
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground shadow-soft">
          <Calculator className="h-3.5 w-3.5 text-brand" />
          Numerical Problems
        </div>
        <h1 className="mt-3 text-3xl font-bold text-foreground">Worked-out numericals</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Step-by-step solutions to syllabus numericals from every unit.
        </p>
      </header>

      <UnitTabs value={unit} onChange={setUnit} />

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl bg-surface-muted" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <div className="card-soft p-10 text-center text-sm text-muted-foreground">
          No numerical problems for this unit yet.
        </div>
      ) : (
        <ol className="space-y-4">
          {data.map((n, i) => {
            const rawSteps = (n.solution_steps ?? []) as any[];
            const formulas = (n.formulas_used ?? []) as string[];
            return (
              <li key={n.id} className="card-soft p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="font-mono text-xs font-semibold text-muted-foreground">P{i + 1}</span>
                    <h3 className="mt-1 text-base font-semibold text-foreground">{n.problem}</h3>
                    <span className="mt-1 inline-flex rounded-full border border-border bg-secondary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      U{n.unit_number} · {n.topic}
                    </span>
                  </div>
                </div>
                {rawSteps.length > 0 && (
                  <ol className="mt-4 space-y-3">
                    {rawSteps.map((s, j) => {
                      const description = typeof s === "string" ? s : s?.description ?? "";
                      const expression = typeof s === "string" ? undefined : s?.expression;
                      const stepNum = typeof s === "string" ? j + 1 : s?.step ?? j + 1;
                      return (
                        <li key={j} className="flex gap-3">
                          <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-border bg-surface-muted text-xs font-semibold text-foreground">
                            {stepNum}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-foreground">{description}</p>
                            {expression && (
                              <pre className="mt-1 overflow-x-auto rounded-lg border border-border bg-surface-muted p-2 font-mono text-xs text-foreground">
                                {expression}
                              </pre>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
                {formulas.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {formulas.map((f, k) => (
                      <span
                        key={k}
                        className="rounded-lg border border-border bg-surface-muted px-2 py-1 font-mono text-xs"
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                )}
                {n.final_answer && (
                  <div className="mt-4 rounded-xl border border-border bg-surface p-3">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Answer
                    </span>
                    <p className="mt-1 text-sm font-semibold text-foreground">{n.final_answer}</p>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
