// Server-side stub — we use TiDB directly, not Supabase.
// This file is kept to satisfy any legacy imports that haven't been migrated yet.
// All actual DB operations go through src/lib/db.server.ts

export const supabaseAdmin = new Proxy({} as any, {
  get(_target, prop) {
    // Return a chainable no-op so legacy code doesn't crash
    const noop: any = () => noop;
    noop.then = undefined; // not a promise
    return noop;
  },
});
