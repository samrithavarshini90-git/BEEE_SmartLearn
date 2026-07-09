import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  BookOpen,
  ListChecks,
  BrainCircuit,
  Users2,
  LogOut,
  Menu,
  X,
  Calculator,
  ClipboardCheck,
  Trophy,
  UserCircle,
} from "lucide-react";
import { Logo } from "@/components/site/logo";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const NAV = [
  { label: "Dashboard", to: "/dashboard" as const, icon: LayoutDashboard },
  { label: "Problem Solver", to: "/solver" as const, icon: BrainCircuit },
  { label: "Formulas", to: "/formulas" as const, icon: BookOpen },
  { label: "Important Q's", to: "/questions" as const, icon: ListChecks },
  { label: "Numericals", to: "/numericals" as const, icon: Calculator },
  { label: "Quiz", to: "/quiz" as const, icon: ClipboardCheck },
  { label: "Leaderboard", to: "/leaderboard" as const, icon: Trophy },
  { label: "Profile", to: "/profile" as const, icon: UserCircle },
];

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const { data: profile } = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes.user;
      if (!user) return null;

      try {
        const { getMyProfile } = await import("@/lib/beee.functions");
        const dbProfile = await getMyProfile();
        return {
          id: user.id,
          email: dbProfile.email,
          fullName: dbProfile.full_name || user.username || "",
          isAdmin: dbProfile.role === "admin",
        };
      } catch (err) {
        return {
          id: user.id,
          email: user.email ?? "",
          fullName: user.user_metadata?.full_name || user.username || "",
          isAdmin: user.role === "admin",
        };
      }
    },
  });

  const nav = profile?.isAdmin
    ? [
        { label: "Dashboard", to: "/admin" as const, icon: LayoutDashboard },
        { label: "Accounts", to: "/accounts" as const, icon: Users2 },
        { label: "Profile", to: "/profile" as const, icon: UserCircle },
      ]
    : NAV.filter((item) => item.to !== "/admin");

  const handleSignOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/auth", replace: true });
  };

  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-border bg-surface lg:flex lg:flex-col">
        <div className="flex h-16 items-center border-b border-border px-5">
          <Link to="/">
            <Logo />
          </Link>
        </div>
        <nav className="flex-1 space-y-1 p-3" aria-label="Main">
          {nav.map((item) => {
            const active = pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-secondary text-foreground shadow-soft"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <item.icon className="h-4 w-4" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border p-3">
          <Link
            to="/profile"
            className="mb-2 block rounded-xl border border-border bg-surface-muted p-3 transition-colors hover:bg-secondary hover:text-foreground"
          >
            <div className="truncate text-sm font-semibold text-foreground">
              {profile?.fullName || "Student"}
            </div>
            <div className="truncate text-xs text-muted-foreground">{profile?.email}</div>
            <div className="mt-2 inline-flex rounded-full border border-border bg-surface px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {profile?.isAdmin ? "Admin" : "Student"}
            </div>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSignOut}
            className="w-full justify-start rounded-xl"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur-xl lg:hidden">
        <Link to="/" className="flex-1">
          <Logo />
        </Link>
        <button
          type="button"
          aria-label={open ? "Close navigation" : "Open navigation"}
          onClick={() => setOpen((v) => !v)}
          className="grid h-10 w-10 place-items-center rounded-full border border-border"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </header>
      {open && (
        <div className="fixed inset-x-0 top-16 z-30 border-b border-border bg-surface lg:hidden">
          <nav className="space-y-1 p-3">
            {nav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-foreground hover:bg-secondary"
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
            <button
              type="button"
              onClick={handleSignOut}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-foreground hover:bg-secondary"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </nav>
        </div>
      )}

      <main className="lg:pl-64">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-10">{children}</div>
      </main>
    </div>
  );
}
