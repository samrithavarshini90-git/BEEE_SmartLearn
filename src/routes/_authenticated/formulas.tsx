import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, Search, ZoomIn } from "lucide-react";
import { listFormulas } from "@/lib/beee.functions";
import { Input } from "@/components/ui/input";
import { UnitTabs } from "@/components/app/unit-tabs";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/formulas")({
  component: FormulasPage,
});

function FormulasPage() {
  const fetchFormulas = useServerFn(listFormulas);
  const [q, setQ] = useState("");
  const [unit, setUnit] = useState<number | null>(1);

  const { data, isLoading } = useQuery({
    queryKey: ["formulas", unit],
    queryFn: () => fetchFormulas({ data: unit ? { unit_number: unit } : {} }),
  });

  const grouped = useMemo(() => {
    const rows = (data ?? []).filter((r) => {
      if (!q) return true;
      const n = q.toLowerCase();
      return (
        r.name.toLowerCase().includes(n) ||
        r.formula.toLowerCase().includes(n) ||
        (r.explanation ?? "").toLowerCase().includes(n) ||
        r.topic.toLowerCase().includes(n)
      );
    });
    const map = new Map<string, typeof rows>();
    for (const r of rows) {
      const arr = map.get(r.topic) ?? [];
      arr.push(r);
      map.set(r.topic, arr);
    }
    return Array.from(map.entries());
  }, [data, q]);

  return (
    <div className="space-y-8">
      <header>
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground shadow-soft">
          <BookOpen className="h-3.5 w-3.5 text-brand" />
          Formula Library
        </div>
        <h1 className="mt-3 text-3xl font-bold text-foreground">BEEE Formulas (Unit-wise)</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every formula from the AI&amp;DS BEEE syllabus, organized by unit and topic.
        </p>
      </header>

      <div className="space-y-3">
        <UnitTabs value={unit} onChange={setUnit} />
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search within selected unit..."
            className="pl-9"
            aria-label="Search formulas"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl bg-surface-muted" />
          ))}
        </div>
      ) : grouped.length === 0 ? (
        <div className="card-soft p-10 text-center text-sm text-muted-foreground">
          No formulas match your search.
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map(([topic, rows]) => (
            <section key={topic}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {topic}
              </h2>
              <ul className="grid gap-4 sm:grid-cols-2">
                {rows.map((f) => {
                  const vars = (f.variables ?? []) as Array<{
                    symbol: string;
                    meaning?: string;
                    desc?: string;
                    unit?: string;
                  }>;
                  const hasImage = !!f.image_url;

                  return (
                    <li 
                      key={f.id} 
                      className={`card-soft card-soft-hover p-5 flex flex-col sm:flex-row gap-5 ${
                        hasImage ? "sm:col-span-2" : ""
                      }`}
                    >
                      <div className="flex-1 space-y-3 min-w-0">
                        <h3 className="text-base font-semibold text-foreground">{f.name}</h3>
                        <div className="rounded-xl border border-border bg-surface-muted p-3 font-mono text-sm text-foreground overflow-x-auto whitespace-nowrap">
                          {f.formula}
                        </div>
                        {f.explanation && (
                          <p className="text-sm text-muted-foreground leading-relaxed">{f.explanation}</p>
                        )}
                        {vars.length > 0 && (
                          <dl className="grid grid-cols-1 gap-1 text-xs pt-1 border-t border-border/40">
                            {vars.map((v) => (
                              <div key={v.symbol} className="flex gap-2">
                                <dt className="font-mono font-semibold text-foreground">
                                  {v.symbol}
                                </dt>
                                <dd className="text-muted-foreground">
                                  — {v.meaning ?? v.desc ?? ""}
                                  {v.unit ? ` (${v.unit})` : ""}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        )}
                      </div>

                      {hasImage && (
                        <div className="relative group/img overflow-hidden rounded-xl border border-border bg-surface/50 p-2 flex items-center justify-center min-h-[140px] max-h-[220px] aspect-[4/3] w-full sm:w-[180px] md:w-[220px] flex-shrink-0 cursor-pointer self-center">
                          <Dialog>
                            <DialogTrigger asChild>
                              <div className="relative w-full h-full flex items-center justify-center">
                                <img
                                  src={f.image_url}
                                  alt={f.name}
                                  className="w-full h-full object-contain select-none group-hover/img:scale-105 transition-transform duration-300 rounded-lg"
                                  loading="lazy"
                                />
                                <div className="absolute inset-0 bg-black/10 opacity-0 group-hover/img:opacity-100 transition-opacity duration-300 rounded-lg flex items-center justify-center">
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-surface/90 text-xs font-semibold text-foreground shadow-md border border-border scale-95 group-hover/img:scale-100 transition-transform duration-300">
                                    <ZoomIn className="h-3.5 w-3.5 text-brand" />
                                    Click to zoom
                                  </span>
                                </div>
                              </div>
                            </DialogTrigger>
                            <DialogContent className="max-w-3xl p-6 bg-surface/95 backdrop-blur-md border border-border shadow-2xl rounded-2xl">
                              <DialogHeader>
                                <DialogTitle className="text-xl font-bold text-foreground mb-1">{f.name}</DialogTitle>
                                <p className="text-sm text-muted-foreground font-mono">{f.formula}</p>
                              </DialogHeader>
                              <div className="mt-4 overflow-hidden rounded-xl border border-border bg-background p-4 flex items-center justify-center">
                                <img
                                  src={f.image_url}
                                  alt={f.name}
                                  className="max-h-[60vh] max-w-full object-contain rounded-lg"
                                />
                              </div>
                              {f.explanation && (
                                <p className="mt-4 text-sm text-muted-foreground leading-relaxed text-center italic">
                                  {f.explanation}
                                </p>
                              )}
                            </DialogContent>
                          </Dialog>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
