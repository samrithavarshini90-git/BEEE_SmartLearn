import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  BookOpen,
  BrainCircuit,
  TrendingUp,
  CheckCircle2,
  ListChecks,
  Sparkles,
  Trophy,
  ClipboardCheck,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { getDashboard } from "@/lib/beee.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const fetchDashboard = useServerFn(getDashboard);
  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => fetchDashboard(),
  });

  if (isLoading) return <PageSkeleton />;
  if (error || !data)
    return (
      <div className="card-soft p-6 text-sm text-destructive">
        Could not load dashboard: {(error as Error)?.message ?? "unknown error"}
      </div>
    );

  return (
    <div className="space-y-8">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground shadow-soft">
            <Sparkles className="h-3.5 w-3.5 text-brand" />
            Dashboard
          </div>
          <h1 className="mt-3 text-3xl font-bold text-foreground">
            Hi, {data.profile.full_name || "there"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Your BEEE learning at a glance.</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" className="rounded-full">
            <Link to="/quiz">
              <ClipboardCheck className="mr-2 h-4 w-4" />
              Take a quiz
            </Link>
          </Button>
          <Button asChild className="rounded-full">
            <Link to="/solver">
              <BrainCircuit className="mr-2 h-4 w-4" />
              Solver
            </Link>
          </Button>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={CheckCircle2} label="Problems solved" value={data.stats.total_solved} />
        <StatCard icon={ClipboardCheck} label="Quiz attempts" value={data.stats.quiz_attempts} />
        <StatCard icon={TrendingUp} label="Avg quiz score" value={`${data.stats.avg_quiz_score}%`} />
        <StatCard icon={Trophy} label="Achievements" value={data.stats.achievements} />
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="card-soft p-6 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Progress by unit</h2>
            <Link to="/formulas" className="text-xs font-medium text-brand hover:underline">
              Browse syllabus →
            </Link>
          </div>
          <ul className="space-y-3">
            {data.progress_by_unit.map((u) => {
              const max = Math.max(1, ...data.progress_by_unit.map((x) => x.items_completed));
              const pct = (u.items_completed / max) * 100;
              return (
                <li key={u.unit_number}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium text-foreground">
                      Unit {u.unit_number} · {u.unit_title}
                    </span>
                    <span className="text-muted-foreground">
                      {u.items_completed} items · {u.points} pts
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
                    <div
                      className="h-full rounded-full bg-brand transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="card-soft p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Achievements</h2>
            <Link to="/leaderboard" className="text-xs font-medium text-brand hover:underline">
              Leaderboard →
            </Link>
          </div>
          {data.achievements.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Take your first quiz to unlock achievements.
            </p>
          ) : (
            <ul className="space-y-3">
              {data.achievements.map((a) => (
                <li key={a.code} className="flex gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border bg-surface-muted text-brand">
                    <Trophy className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-foreground">{a.title}</div>
                    <div className="text-xs text-muted-foreground">{a.description}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="card-soft p-6">
          <h2 className="mb-4 text-lg font-semibold text-foreground">Recent activity</h2>
          {data.recent_activity.length === 0 ? (
            <EmptyState
              icon={ListChecks}
              title="Nothing yet — try a quiz or the solver."
              cta={{ label: "Open solver", to: "/solver" }}
            />
          ) : (
            <ol className="space-y-3">
              {data.recent_activity.map((a) => (
                <li key={a.id} className="flex gap-3 border-b border-border pb-3 last:border-0">
                  <span className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border bg-surface-muted text-brand">
                    <Activity className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">
                      {a.description || a.type}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {a.topic ?? "General"} · {new Date(a.created_at).toLocaleString()}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="card-soft p-6">
          <h2 className="mb-4 text-lg font-semibold text-foreground">Progress by topic</h2>
          {data.progress_by_topic.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="No solved problems yet"
              cta={{ label: "Try the solver", to: "/solver" }}
            />
          ) : (
            <ul className="space-y-3">
              {data.progress_by_topic.slice(0, 8).map((t) => {
                const max = Math.max(...data.progress_by_topic.map((x) => x.solved));
                const pct = max > 0 ? (t.solved / max) * 100 : 0;
                return (
                  <li key={t.topic}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium text-foreground">{t.topic}</span>
                      <span className="text-muted-foreground">{t.solved} · {t.marks}m</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
                      <div
                        className="h-full rounded-full bg-brand"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
}) {
  return (
    <div className="card-soft card-soft-hover p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-surface-muted text-brand">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-3 text-3xl font-bold text-foreground">{value}</div>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  cta,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  cta: { label: string; to: "/solver" | "/formulas" | "/questions" | "/quiz" };
}) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl border border-border bg-surface-muted text-muted-foreground">
        <Icon className="h-5 w-5" />
      </span>
      <p className="mt-3 text-sm text-muted-foreground">{title}</p>
      <Button asChild variant="outline" size="sm" className="mt-4 rounded-full">
        <Link to={cta.to}>{cta.label}</Link>
      </Button>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-24 animate-pulse rounded-2xl bg-surface-muted" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-surface-muted" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-2xl bg-surface-muted" />
    </div>
  );
}
