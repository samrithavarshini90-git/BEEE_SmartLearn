import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/site/logo";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const searchSchema = z.object({
  mode: z.enum(["signin", "signup"]).optional(),
});

export const Route = createFileRoute("/auth")({
  validateSearch: (s) => searchSchema.parse(s),
  component: AuthPage,
});

const credentialsSchema = z.object({
  email: z.string().trim().email("Enter a valid email").max(160).optional(),
  username: z.string().trim().min(3, "Username must be at least 3 characters").max(80).optional(),
  loginIdentifier: z.string().trim().min(3, "Username or email must be at least 3 characters").max(160).optional(),
  password: z.string().min(4, "Password must be at least 4 characters").max(72),
  fullName: z.string().trim().max(80).optional(),
});

function AuthPage() {
  const search = useSearch({ from: "/auth" });
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">(search.mode ?? "signin");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const payload: any = {
      password: String(form.get("password") ?? ""),
    };
    if (mode === "signup") {
      payload.email = String(form.get("email") ?? "");
      payload.username = String(form.get("username") ?? "");
      payload.fullName = String(form.get("fullName") ?? "");
    } else {
      payload.loginIdentifier = String(form.get("loginIdentifier") ?? "");
    }

    const parse = credentialsSchema.safeParse(payload);
    if (!parse.success) {
      toast.error(parse.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: parse.data.email,
          password: parse.data.password,
          options: {
            data: { 
              full_name: parse.data.fullName ?? "",
              username: parse.data.username ?? "",
            },
          },
        });
        if (error) throw error;
        toast.success("Account created — you're signed in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          username: parse.data.loginIdentifier,
          password: parse.data.password,
        });
        if (error) throw error;
        toast.success("Welcome back!");
      }
      navigate({ to: "/dashboard" });
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      // Never expose SQL/DB internals — always show a clean message
      const isTechnical =
        raw.includes("CREATE command denied") ||
        raw.includes("ER_") ||
        raw.includes("sql") ||
        raw.includes("Error:") ||
        raw.includes("ECONNREFUSED") ||
        raw.includes("denied") ||
        raw.length > 150;
      const knownMessages: Record<string, string> = {
        "Username is already taken.": "That username is already taken. Try another.",
        "Email is already registered.": "An account with that email already exists. Sign in instead.",
        "Invalid username or password.": "Invalid username or password. Please try again.",
      };
      const friendly = knownMessages[raw] ?? (
        isTechnical
          ? mode === "signup"
            ? "Could not create account. Please try again in a moment."
            : "Sign in failed. Please check your credentials and try again."
          : raw
      );
      toast.error(friendly);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden border-r border-border bg-surface-muted lg:block">
        <div className="pointer-events-none absolute inset-0 grid-lines opacity-70" aria-hidden />
        <div className="relative flex h-full flex-col justify-between p-12">
          <Link to="/">
            <Logo />
          </Link>
          <div className="max-w-md">
            <h2 className="text-3xl font-bold text-foreground">
              Your AI tutor for Basic Electrical & Electronics.
            </h2>
            <p className="mt-3 text-muted-foreground">
              Solve any problem step-by-step, learn from a curated formula library, and track
              your progress across every topic.
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Passwords are hashed. Sessions use signed JWTs.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-center bg-background p-6 sm:p-10">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center justify-between lg:hidden">
            <Link to="/">
              <Logo />
            </Link>
          </div>

          <div className="flex rounded-full border border-border bg-surface-muted p-1">
            {(["signin", "signup"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  mode === m
                    ? "bg-surface text-foreground shadow-soft"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m === "signin" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          <h1 className="mt-8 text-2xl font-bold text-foreground">
            {mode === "signin" ? "Welcome back" : "Start learning today"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "signin"
              ? "Sign in to continue your BEEE study session."
              : "Create your free student account in seconds."}
          </p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            {mode === "signup" && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="fullName">Full name</Label>
                  <Input
                    id="fullName"
                    name="fullName"
                    required
                    maxLength={80}
                    autoComplete="name"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    name="username"
                    required
                    maxLength={80}
                    autoComplete="username"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    maxLength={160}
                  />
                </div>
              </>
            )}
            {mode === "signin" && (
              <div className="space-y-1.5">
                <Label htmlFor="loginIdentifier">Username or Email</Label>
                <Input
                  id="loginIdentifier"
                  name="loginIdentifier"
                  required
                  maxLength={160}
                  autoComplete="username"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                minLength={4}
                maxLength={72}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
              />
              <p className="text-xs text-muted-foreground">
                Minimum 4 characters. Passwords are hashed securely.
              </p>
            </div>
            <Button type="submit" className="w-full rounded-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {mode === "signin" ? "Signing in..." : "Creating account..."}
                </>
              ) : mode === "signin" ? (
                "Sign in"
              ) : (
                "Create account"
              )}
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            By continuing you agree to our terms & privacy notice.
          </p>
        </div>
      </div>
    </div>
  );
}
