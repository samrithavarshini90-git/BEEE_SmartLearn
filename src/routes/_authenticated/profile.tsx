import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { UserCircle, Mail, AtSign, ShieldCheck, Star, Brain, ClipboardCheck, Trophy, Pencil, Check, X, ShieldAlert } from "lucide-react";
import { getMyProfile, updateProfile } from "@/lib/beee.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/profile")({
  component: ProfilePage,
});

function StatCard({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string | number }) {
  return (
    <div className="card-soft flex flex-col gap-2 p-5">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5 text-brand" />
        {label}
      </div>
      <div className="text-2xl font-bold text-foreground">{value}</div>
    </div>
  );
}

function AchievementBadge({ title, icon, earned_at }: { title: string; icon: string; earned_at: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 shadow-soft">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-muted text-lg">
        {icon === "sparkles" ? "✦" : icon === "target" ? "◎" : icon === "graduation-cap" ? "🎓" : icon === "crown" ? "♛" : icon === "medal" ? "⬡" : "★"}
      </span>
      <div>
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <div className="text-xs text-muted-foreground">{new Date(earned_at).toLocaleDateString()}</div>
      </div>
    </div>
  );
}

function ProfilePage() {
  const fetchProfile = useServerFn(getMyProfile);
  const doUpdateProfile = useServerFn(updateProfile);
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["my-profile"],
    queryFn: () => fetchProfile(),
  });

  const initials = (profile?.full_name || profile?.username || "?")
    .split(" ")
    .map((w: string) => w[0]?.toUpperCase())
    .slice(0, 2)
    .join("");

  const handleEdit = () => {
    setNewName(profile?.full_name ?? "");
    setEditing(true);
  };

  const handleSave = async () => {
    if (!newName.trim()) { toast.error("Name cannot be empty."); return; }
    setSaving(true);
    try {
      await doUpdateProfile({ data: { fullName: newName.trim() } });
      queryClient.invalidateQueries({ queryKey: ["my-profile"] });
      queryClient.invalidateQueries({ queryKey: ["me"] });
      toast.success("Profile updated.");
      setEditing(false);
    } catch {
      toast.error("Could not update profile.");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-40 animate-pulse rounded-2xl bg-surface-muted" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-surface-muted" />)}
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="card-soft p-10 text-center text-sm text-muted-foreground">
        Could not load profile. Please refresh.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header>
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground shadow-soft">
          <UserCircle className="h-3.5 w-3.5 text-brand" />
          Profile
        </div>
        <h1 className="mt-3 text-3xl font-bold text-foreground">My Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your account information and learning progress.</p>
      </header>

      {/* Profile Card */}
      <section className="card-soft p-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
          {/* Avatar */}
          <div className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl bg-brand text-2xl font-bold text-white shadow-soft">
            {initials}
          </div>

          {/* Info */}
          <div className="flex-1 space-y-4">
            {/* Name */}
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Display name</label>
              {editing ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="max-w-xs"
                    maxLength={80}
                    autoFocus
                  />
                  <Button size="sm" onClick={handleSave} disabled={saving}>
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold text-foreground">{profile.full_name || profile.username}</span>
                  <button
                    onClick={handleEdit}
                    className="grid h-7 w-7 place-items-center rounded-lg border border-border bg-surface-muted text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    title="Edit name"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* Meta */}
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <div className="flex items-center gap-2 text-muted-foreground">
                <AtSign className="h-4 w-4 shrink-0" />
                {profile.username}
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Mail className="h-4 w-4 shrink-0" />
                {profile.email}
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <ShieldCheck className="h-4 w-4 shrink-0" />
                <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider">
                  {profile.role}
                </span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Star className="h-4 w-4 shrink-0" />
                Joined {new Date(profile.created_at).toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Conditionally render admin panel options or student progress */}
      {profile.role === "admin" ? (
        <section className="card-soft p-6 border-brand/20 bg-surface-muted/30">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-brand">
                <ShieldAlert className="h-4 w-4" />
                Administrative Account
              </div>
              <p className="text-sm text-muted-foreground">
                You have administrative access to manage student users, reset credentials, delete accounts, and review database analytics.
              </p>
            </div>
            <Link
              to="/admin"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition-all hover:bg-brand/90 focus:outline-none shrink-0"
            >
              Open Admin Panel
            </Link>
          </div>
        </section>
      ) : (
        <>
          {/* Stats */}
          <section>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Learning Statistics</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatCard icon={Brain} label="Problems Solved" value={profile.stats.problems_solved} />
              <StatCard icon={ClipboardCheck} label="Quiz Attempts" value={profile.stats.quiz_attempts} />
              <StatCard icon={Star} label="Avg Quiz Score" value={`${profile.stats.avg_score}%`} />
              <StatCard icon={Trophy} label="Total Points" value={profile.stats.total_points} />
            </div>
          </section>

          {/* Achievements */}
          {profile.achievements.length > 0 ? (
            <section>
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Achievements ({profile.achievements.length})
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {profile.achievements.map((a: any) => (
                  <AchievementBadge key={a.code} title={a.title} icon={a.icon} earned_at={a.earned_at} />
                ))}
              </div>
            </section>
          ) : (
            <section className="card-soft p-8 text-center text-sm text-muted-foreground">
              No achievements yet — solve problems and take quizzes to earn badges!
            </section>
          )}
        </>
      )}
    </div>
  );
}
