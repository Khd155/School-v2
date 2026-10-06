import { sha256Hex } from "./crypto";

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

// Subjects (e-mails, IPs) are hashed so the table holds no personal data.
const keyFor = async (limit: Limit, subject: string) => `${limit.name}:${await sha256Hex(subject)}`;

/**
 * Counts one attempt atomically (fixed window) *before* the secret is checked,
 * so parallel requests cannot slip past the limit. Returns minutes until the
 * window resets when over the limit, otherwise null.
 */
export async function consumeAttempt(db: D1Database, limit: Limit, subject: string): Promise<number | null> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - limit.windowMinutes * 60_000).toISOString();
  const row = await db
    .prepare(
      `INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1)
       ON CONFLICT (key) DO UPDATE SET
         count = CASE WHEN rate_limits.window_start < ?3 THEN 1 ELSE rate_limits.count + 1 END,
         window_start = CASE WHEN rate_limits.window_start < ?3 THEN ?2 ELSE rate_limits.window_start END
       RETURNING count, window_start`,
    )
    .bind(await keyFor(limit, subject), now.toISOString(), cutoff)
    .first<{ count: number; window_start: string }>();
  if (!row || row.count <= limit.max) return null;
  const resetAt = Date.parse(row.window_start) + limit.windowMinutes * 60_000;
  return Math.max(1, Math.ceil((resetAt - now.getTime()) / 60_000));
}

export async function clearAttempts(db: D1Database, limit: Limit, subject: string): Promise<void> {
  await db.prepare("DELETE FROM rate_limits WHERE key = ?").bind(await keyFor(limit, subject)).run();
}

export async function pruneRateLimits(db: D1Database): Promise<void> {
  await db.prepare("DELETE FROM rate_limits WHERE window_start < ?").bind(new Date(Date.now() - 86_400_000).toISOString()).run();
}
