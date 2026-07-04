import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { verifyToken } from "@/lib/auth-utils.server";
import { ensureDb } from "@/lib/db.server";

export const requireSupabaseAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    // Ensure DB is initialized
    await ensureDb();

    const request = getRequest();
    if (!request?.headers) {
      throw new Error("Unauthorized: No request headers available");
    }

    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      throw new Error("Unauthorized: No authorization header provided");
    }

    if (!authHeader.startsWith("Bearer ")) {
      throw new Error("Unauthorized: Only Bearer tokens are supported");
    }

    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      throw new Error("Unauthorized: No token provided");
    }

    const payload = verifyToken(token);
    if (!payload || !payload.sub) {
      throw new Error("Unauthorized: Invalid session or token");
    }

    return next({
      context: {
        userId: payload.sub,
        user: payload,
        supabase: null, // server functions will query TiDB directly via pool
      },
    });
  },
);
