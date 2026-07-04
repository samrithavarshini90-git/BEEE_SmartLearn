import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Trophy } from "lucide-react";
import { getLeaderboard } from "@/lib/beee.functions";

export const Route = createFileRoute("/_authenticated/leaderboard")({
  component: LeaderboardPage,
});

function LeaderboardPage() {
  const fetch = useServerFn(getLeaderboard);
  const { data, isLoading } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: () => fetch(),
  });

  return (
    <div className="space-y-8">
      <header>
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground shadow-soft">
          <Trophy className="h-3.5 w-3.5 text-brand" />
          Leaderboard
        </div>
        <h1 className="mt-3 text-3xl font-bold text-foreground">Top learners</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Points come from quizzes and solved problems. Compete with your batch.
        </p>
      </header>

      {isLoading ? (
        <div className="h-96 animate-pulse rounded-2xl bg-surface-muted" />
      ) : !data || data.length === 0 ? (
        <div className="card-soft p-10 text-center text-sm text-muted-foreground">
          No activity yet. Take a quiz to appear here!
        </div>
      ) : (
        <ol className="card-soft divide-y divide-border overflow-hidden">
          {data.map((row, i) => (
            <li
              key={row.user_id}
              className={`flex items-center gap-4 p-4 ${row.is_me ? "bg-primary/5" : ""}`}
            >
              <span
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold ${
                  i === 0
                    ? "bg-yellow-100 text-yellow-800"
                    : i === 1
                      ? "bg-slate-100 text-slate-800"
                      : i === 2
                        ? "bg-orange-100 text-orange-800"
                        : "border border-border bg-surface-muted text-muted-foreground"
                }`}
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-foreground">
                  {row.name} {row.is_me && <span className="ml-1 text-xs text-brand">· you</span>}
                </div>
                <div className="text-xs text-muted-foreground">
                  {row.items} activities · avg score {row.avg_score}%
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-foreground">{row.points}</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">pts</div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
