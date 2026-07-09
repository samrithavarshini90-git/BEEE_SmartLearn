import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Users2, KeyRound, Trash2, ShieldAlert } from "lucide-react";
import { listAllUsers, resetUserPassword, deleteUser } from "@/lib/beee.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/accounts")({
  component: AccountsPage,
});

function AccountsPage() {
  const fetchUsers = useServerFn(listAllUsers);
  const handleResetPassword = useServerFn(resetUserPassword);
  const handleDeleteUser = useServerFn(deleteUser);
  const queryClient = useQueryClient();

  const [viewTab, setViewTab] = useState<"students" | "all">("students");

  const { data: users = [], isLoading, error } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => fetchUsers(),
  });

  const forbidden = (error as Error | undefined)?.message?.includes("Forbidden");

  if (forbidden) {
    return (
      <div className="card-soft flex flex-col items-center gap-3 p-10 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-2xl border border-border bg-surface-muted text-destructive">
          <ShieldAlert className="h-5 w-5" />
        </span>
        <h1 className="text-xl font-semibold text-foreground">Admin access required</h1>
        <p className="text-sm text-muted-foreground">Your account doesn't have admin privileges.</p>
      </div>
    );
  }

  const students = users.filter((u: any) => !u.roles?.includes("admin"));
  const displayedUsers = viewTab === "students" ? students : users;

  return (
    <div className="space-y-8">
      <header>
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground shadow-soft">
          <Users2 className="h-3.5 w-3.5 text-brand" />
          Accounts
        </div>
        <h1 className="mt-3 text-3xl font-bold text-foreground">Account Management</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          View registered accounts, reset passwords, and manage access.
        </p>
      </header>

      {/* Directory Table */}
      <section className="card-soft overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-6 py-4 flex-wrap gap-4">
          <div className="flex items-center gap-4 flex-wrap">
            <h2 className="text-lg font-semibold text-foreground">User Directory</h2>
            <div className="inline-flex rounded-full border border-border bg-surface-muted p-1">
              <button
                type="button"
                onClick={() => setViewTab("students")}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
                  viewTab === "students"
                    ? "bg-surface text-foreground shadow-soft"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Students Only
              </button>
              <button
                type="button"
                onClick={() => setViewTab("all")}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
                  viewTab === "all"
                    ? "bg-surface text-foreground shadow-soft"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                All Accounts
              </button>
            </div>
          </div>
          <span className="text-xs text-muted-foreground">
            {viewTab === "students"
              ? `${students.length} students`
              : `${users.length} total accounts`}
          </span>
        </div>

        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="space-y-3 p-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded-lg bg-surface-muted" />
              ))}
            </div>
          ) : displayedUsers.length === 0 ? (
            <div className="px-6 py-8 text-center text-sm text-muted-foreground">
              No accounts found.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-surface-muted text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-6 py-3">Name / Username</th>
                  <th className="px-6 py-3">Email</th>
                  {viewTab === "all" && <th className="px-6 py-3">Role</th>}
                  <th className="px-6 py-3">Activity</th>
                  <th className="px-6 py-3">Joined</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayedUsers.map((u: any) => {
                  const isUserAdmin = u.roles?.includes("admin") || u.role === "admin";
                  return (
                    <tr key={u.id} className="border-t border-border">
                      <td className="px-6 py-3 font-medium text-foreground">
                        {u.full_name || "—"}
                        {u.username && <span className="ml-1.5 text-xs text-muted-foreground">({u.username})</span>}
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">{u.email}</td>
                      {viewTab === "all" && (
                        <td className="px-6 py-3">
                          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            isUserAdmin
                              ? "bg-brand/10 text-brand border border-brand/20"
                              : "bg-secondary text-muted-foreground border border-border"
                          }`}>
                            {isUserAdmin ? "Admin" : "Student"}
                          </span>
                        </td>
                      )}
                      <td className="px-6 py-3 text-muted-foreground">{u.activity_count ?? 0}</td>
                      <td className="px-6 py-3 text-muted-foreground">
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {/* Reset password */}
                          <button
                            onClick={async () => {
                              const newPass = window.prompt(`New password for ${u.full_name || u.username}:`);
                              if (newPass === null) return;
                              if (newPass.length < 4) { toast.error("Password must be at least 4 characters."); return; }
                              try {
                                await handleResetPassword({ data: { userId: u.id, newPassword: newPass } });
                                toast.success("Password reset successfully.");
                              } catch (err: any) {
                                toast.error(err.message || "Failed to reset password.");
                              }
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-brand shadow-soft transition-colors hover:bg-secondary hover:text-foreground"
                          >
                            <KeyRound className="h-3 w-3" />
                            Reset
                          </button>

                          {/* Delete account — hide for admin accounts */}
                          {!isUserAdmin && (
                            <button
                              onClick={async () => {
                                const confirmed = window.confirm(
                                  `Delete ${u.full_name || u.username}'s account?\nThis cannot be undone.`
                                );
                                if (!confirmed) return;
                                try {
                                  await handleDeleteUser({ data: { userId: u.id } });
                                  toast.success("Account deleted.");
                                  queryClient.invalidateQueries({ queryKey: ["admin-users"] });
                                } catch (err: any) {
                                  toast.error(err.message || "Failed to delete account.");
                                }
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-destructive/30 bg-destructive/5 px-2.5 py-1 text-xs font-semibold text-destructive shadow-soft transition-colors hover:bg-destructive hover:text-white"
                            >
                              <Trash2 className="h-3 w-3" />
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
