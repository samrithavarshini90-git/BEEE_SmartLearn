// Global fetch interceptor — attaches the JWT auth token to all TanStack
// Start server function requests (/_server paths) so requireSupabaseAuth can
// authenticate them on the server side.

if (typeof window !== "undefined") {
  const _origFetch = window.fetch.bind(window);
  (window as any).__beeeAuthInterceptorInstalled = true;

  window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
        ? input.href
        : (input as Request).url;

    if (url && (url.includes("/_server") || url.startsWith("/api/"))) {
      try {
        const token = localStorage.getItem("auth_token");
        if (token) {
          const headers = new Headers((init?.headers as HeadersInit | undefined) ?? {});
          if (!headers.has("Authorization")) {
            headers.set("Authorization", `Bearer ${token}`);
          }
          init = { ...init, headers };
        }
      } catch {
        // localStorage may not be available in some edge cases
      }
    }
    return _origFetch(input as any, init);
  };
}
