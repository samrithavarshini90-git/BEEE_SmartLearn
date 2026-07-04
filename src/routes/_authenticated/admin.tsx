import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Users2, Activity, ShieldAlert, TrendingUp, ClipboardCheck,
  CheckCircle2, LayoutDashboard
} from "lucide-react";
import { getAdminAnalytics, listAllUsers, listRecentActivity } from "@/lib/beee.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
});

function AdminPage() {
  const fetchUsers = useServerFn(listAllUsers);
  const fetchActivity = useServerFn(listRecentActivity);
  const fetchAnalytics = useServerFn(getAdminAnalytics);

  const usersQ = useQuery({ queryKey: ["admin-users"], queryFn: () => fetchUsers() });
  const activityQ = useQuery({ queryKey: ["admin-activity"], queryFn: () => fetchActivity() });
  const analyticsQ = useQuery({ queryKey: ["admin-analytics"], queryFn: () => fetchAnalytics() });

  const forbidden = (usersQ.error as Error | undefined)?.message?.includes("Forbidden");

  if (forbidden)
    return (
      <div className="card-soft flex flex-col items-center gap-3 p-10 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-2xl border border-border bg-surface-muted text-destructive">
          <ShieldAlert className="h-5 w-5" />
        </span>
        <h1 className="text-xl font-semibold text-foreground">Admin access required</h1>
        <p className="text-sm text-muted-foreground">Your account doesn't have admin privileges.</p>
      </div>
    );

  const studentsCount = (usersQ.data ?? []).filter((u: any) => !u.roles?.includes("admin")).length;

  return (
    <div className="space-y-8">
      <header>
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground shadow-soft">
          <LayoutDashboard className="h-3.5 w-3.5 text-brand" />
          Dashboard
        </div>
        <h1 className="mt-3 text-3xl font-bold text-foreground">Admin Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Platform statistics, activity trends, and system event logs.
        </p>
      </header>

      {/* ── Analytics tiles ── */}
      {analyticsQ.data && (
        <>
          <section className="grid gap-4 sm:grid-cols-3">
            <StatTile icon={Users2} label="Registered students" value={studentsCount} />
            <StatTile icon={CheckCircle2} label="Problems solved" value={analyticsQ.data.totals.problems_solved} />
            <StatTile icon={ClipboardCheck} label="Quiz attempts" value={analyticsQ.data.totals.quiz_attempts} />
          </section>

          {/* ── Charts ── */}
          <section className="grid gap-6 lg:grid-cols-2">
            <div className="card-soft p-6">
              <div className="mb-4 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-brand" />
                <h2 className="text-lg font-semibold text-foreground">Activity — last 7 days</h2>
              </div>
              <div className="flex h-40 items-end gap-2">
                {analyticsQ.data.daily_activity.map((d) => {
                  const max = Math.max(1, ...analyticsQ.data!.daily_activity.map((x) => x.count));
                  const h = (d.count / max) * 100;
                  return (
                    <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
                      <div className="flex w-full flex-1 items-end">
                        <div
                          className="w-full rounded-t-md bg-brand transition-all"
                          style={{ height: `${h}%` }}
                          title={`${d.count}`}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground">{d.day}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="card-soft p-6">
              <h2 className="mb-4 text-lg font-semibold text-foreground">Student progress per unit</h2>
              <ul className="space-y-2">
                {analyticsQ.data.per_unit.map((u) => {
                  const max = Math.max(1, ...analyticsQ.data!.per_unit.map((x) => x.items_completed));
                  const pct = (u.items_completed / max) * 100;
                  return (
                    <li key={u.unit_number}>
                      <div className="flex justify-between text-xs">
                        <span className="font-medium text-foreground">Unit {u.unit_number}</span>
                        <span className="text-muted-foreground">{u.items_completed} completed</span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-muted">
                        <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>
        </>
      )}

      {/* ── System activity log ── */}
      <section className="card-soft p-6">
        <div className="mb-4 flex items-center gap-2">
          <Activity className="h-4 w-4 text-brand" />
          <h2 className="text-lg font-semibold text-foreground">Recent activity log</h2>
        </div>
        <ol className="space-y-3">
          {(activityQ.data ?? []).map((a) => (
            <li
              key={a.id}
              className="flex items-start justify-between gap-3 border-b border-border pb-3 last:border-0"
            >
              <div className="min-w-0">
                <div className="truncate text-sm text-foreground">{a.description || a.activity_type}</div>
                <div className="text-xs text-muted-foreground">
                  {a.topic ?? "General"} · user {a.user_id.slice(0, 8)}
                </div>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">
                {new Date(a.created_at).toLocaleString()}
              </span>
            </li>
          ))}
          {(activityQ.data ?? []).length === 0 && (
            <li className="text-sm text-muted-foreground">No activity yet.</li>
          )}
        </ol>
      </section>
    </div>
  );
}

function StatTile({
  icon: Icon, label, value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <div className="card-soft p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-surface-muted text-brand">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-3 text-3xl font-bold text-foreground">{value}</div>
    </div>
  );
}
