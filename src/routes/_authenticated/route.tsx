import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app/app-shell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });

    const isAdmin = data.user.role === "admin";
    const path = location.pathname;

    // Admin role routing rules
    if (isAdmin) {
      if (path !== "/admin" && path !== "/profile" && path !== "/accounts") {
        throw redirect({ to: "/admin" });
      }
    } else {
      if (path === "/admin" || path === "/accounts") {
        throw redirect({ to: "/dashboard" });
      }
    }

    return { user: data.user };
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
