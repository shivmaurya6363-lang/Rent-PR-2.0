import "server-only";
import { timingSafeEqual } from "node:crypto";
import { adminClient } from "./supabase";
import { HttpError } from "./http";

export interface AuthedUser {
  id: string;
  email: string | null;
  roles: string[];
}

/** Authenticate a request by its Supabase access token (Authorization: Bearer ...). */
export async function requireUser(req: Request): Promise<AuthedUser> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) throw new HttpError(401, "Please sign in to continue", "UNAUTHENTICATED");

  const db = adminClient();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "Your session has expired. Please sign in again.", "UNAUTHENTICATED");

  const { data: roleRows } = await db.from("user_roles").select("role").eq("user_id", data.user.id);
  return { id: data.user.id, email: data.user.email ?? null, roles: (roleRows ?? []).map((r) => r.role as string) };
}

export async function requireAdmin(req: Request): Promise<AuthedUser> {
  const user = await requireUser(req);
  if (!user.roles.includes("admin")) throw new HttpError(403, "You do not have access to this action", "FORBIDDEN");
  return user;
}

/** Shared-secret guard for scheduler endpoints (Vercel Cron / external cron). */
export function requireCron(req: Request, secret: string | undefined) {
  if (!secret) throw new HttpError(503, "Cron is not configured", "CRON_NOT_CONFIGURED");
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw new HttpError(401, "Unauthorized", "UNAUTHORIZED");
  }
}
