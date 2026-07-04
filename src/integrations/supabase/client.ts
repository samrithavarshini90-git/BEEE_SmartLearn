// Client-side authentication mock matching Supabase client signature.
// This routes all requests to our TiDB-backed server functions.

function decodeJwt(token: string) {
  try {
    const base64Url = token.split(".")[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

const listeners: Array<(event: string, session: any) => void> = [];

export const supabase = {
  auth: {
    async getSession() {
      if (typeof window === "undefined") {
        return { data: { session: null }, error: null };
      }
      const token = localStorage.getItem("auth_token");
      if (!token) return { data: { session: null }, error: null };
      return { data: { session: { access_token: token } }, error: null };
    },

    async getUser() {
      if (typeof window === "undefined") {
        return { data: { user: null }, error: null };
      }
      const token = localStorage.getItem("auth_token");
      if (!token) return { data: { user: null }, error: new Error("No session") };
      const payload = decodeJwt(token);
      if (!payload) return { data: { user: null }, error: new Error("Invalid token") };
      return {
        data: {
          user: {
            id: payload.sub,
            email: payload.email,
            username: payload.username,
            role: payload.role,
            user_metadata: { full_name: payload.fullName },
          },
        },
        error: null,
      };
    },

    async signUp({ email, password, options }: any) {
      try {
        const fullName = options?.data?.full_name || "";
        const username = options?.data?.username || email.split("@")[0] || "";

        const { signUpUser } = await import("@/lib/beee.functions");
        const result = await signUpUser({
          data: { email, username, password, fullName },
        });

        if (typeof window !== "undefined") {
          localStorage.setItem("auth_token", result.token);
          localStorage.setItem("auth_user", JSON.stringify(result.user));
        }

        // Notify listeners
        listeners.forEach((cb) => cb("SIGNED_IN", { access_token: result.token, user: result.user }));
        return { data: { user: result.user, session: { access_token: result.token } }, error: null };
      } catch (err: any) {
        return { data: { user: null, session: null }, error: err };
      }
    },

    async signInWithPassword({ email, password, username }: any) {
      try {
        // Here, email can be username or email depending on what they typed in.
        // We will call the signInUser server function.
        const { signInUser } = await import("@/lib/beee.functions");
        const loginIdentifier = username || email;
        const result = await signInUser({
          data: { loginIdentifier, password },
        });

        if (typeof window !== "undefined") {
          localStorage.setItem("auth_token", result.token);
          localStorage.setItem("auth_user", JSON.stringify(result.user));
        }

        // Notify listeners
        listeners.forEach((cb) => cb("SIGNED_IN", { access_token: result.token, user: result.user }));
        return { data: { user: result.user, session: { access_token: result.token } }, error: null };
      } catch (err: any) {
        return { data: { user: null, session: null }, error: err };
      }
    },

    async signOut() {
      if (typeof window !== "undefined") {
        localStorage.removeItem("auth_token");
        localStorage.removeItem("auth_user");
      }
      listeners.forEach((cb) => cb("SIGNED_OUT", null));
      return { error: null };
    },

    onAuthStateChange(callback: (event: string, session: any) => void) {
      listeners.push(callback);
      // Fire immediately if there is a session
      this.getSession().then(({ data }) => {
        if (data.session) {
          this.getUser().then(({ data: u }) => {
            callback("SIGNED_IN", { access_token: data.session?.access_token, user: u.user });
          });
        } else {
          callback("SIGNED_OUT", null);
        }
      });
      return {
        data: {
          subscription: {
            unsubscribe() {
              const idx = listeners.indexOf(callback);
              if (idx !== -1) listeners.splice(idx, 1);
            },
          },
        },
      };
    },
  },

  // Mock postgrest query builder for client-side pages that fetch user roles or profiles
  from(table: string) {
    return {
      select(fields: string) {
        return {
          eq(field: string, value: any) {
            return {
              async maybeSingle() {
                if (table === "profiles") {
                  if (typeof window === "undefined") return { data: null, error: null };
                  const token = localStorage.getItem("auth_token");
                  if (!token) return { data: null, error: null };
                  const payload = decodeJwt(token);
                  if (!payload) return { data: null, error: null };
                  return {
                    data: {
                      email: payload.email,
                      full_name: payload.fullName,
                    },
                    error: null,
                  };
                }
                return { data: null, error: null };
              },
            };
          },
          async then(resolve: any) {
            if (table === "user_roles") {
              if (typeof window === "undefined") return resolve({ data: [], error: null });
              const token = localStorage.getItem("auth_token");
              if (!token) return resolve({ data: [], error: null });
              const payload = decodeJwt(token);
              if (!payload) return resolve({ data: [], error: null });
              return resolve({
                data: [{ role: payload.role }],
                error: null,
              });
            }
            return resolve({ data: [], error: null });
          },
        };
      },
    };
  },
} as any;
