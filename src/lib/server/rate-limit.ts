import "server-only";
import { db } from "./db";
import { sha256 } from "./crypto";

export type Limit = { name: string; max: number; windowMinutes: number };

export const LIMITS = {
  /** Lookup attempts for one student e-mail, from any IP. Cleared on success. */
  lookupEmail: { name: "lookup-email", max: 5, windowMinutes: 15 },
  /** Lookup attempts from one IP, across e-mails. */
  lookupIp: { name: "lookup-ip", max: 30, windowMinutes: 15 },
  /** Teacher login attempts from one IP. Cleared on success. */
  adminIp: { name: "admin-ip", max: 5, windowMinutes: 15 },
  /** Teacher login attempts overall, so a distributed guesser is also slowed down. */
  adminGlobal: { name: "admin-global", max: 30, windowMinutes: 15 },
} satisfies Record<string, Limit>;

function keyFor(limit: Limit, subject: string): string {
  // Subjects (e-mails, IPs) are hashed so the table holds no personal data.
  return `${limit.name}:${sha256(subject)}`;
}

/**
 * Counts one attempt atomically (fixed window) *before* the secret is checked,
 * so parallel requests cannot slip past the limit. Returns minutes until the
 * window resets when the subject is over the limit, otherwise null.
 */
export async function consumeAttempt(limit: Limit, subject: string): Promise<number | null> {
  const interval = `${limit.windowMinutes} minutes`;
  const [row] = await db()`
    insert into rate_limits (key, window_start, count)
    values (${keyFor(limit, subject)}, now(), 1)
    on conflict (key) do update set
      count = case when rate_limits.window_start < now() - ${interval}::interval then 1 else rate_limits.count + 1 end,
      window_start = case when rate_limits.window_start < now() - ${interval}::interval then now() else rate_limits.window_start end
    returning count, window_start
  `;
  if (row.count <= limit.max) return null;
  const resetAt = new Date(row.window_start).getTime() + limit.windowMinutes * 60_000;
  return Math.max(1, Math.ceil((resetAt - Date.now()) / 60_000));
}

export async function clearAttempts(limit: Limit, subject: string): Promise<void> {
  await db()`delete from rate_limits where key = ${keyFor(limit, subject)}`;
}

/** Opportunistic cleanup of expired rows. */
export async function pruneRateLimits(): Promise<void> {
  await db()`delete from rate_limits where window_start < now() - interval '1 day'`;
}
