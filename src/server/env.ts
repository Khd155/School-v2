import type { Fetcher } from "@cloudflare/workers-types";

export type Env = {
  DB: D1Database;
  /** Browser Rendering binding, used for PDF generation. */
  BROWSER: Fetcher;
  /** Initial teacher password; used once on first login, then a hash is stored. */
  ADMIN_PASSWORD: string;
  /** Signs parent-session cookies. Rotating it signs everyone out. */
  SESSION_SECRET: string;
  /** Pepper for access-code and password hashes. Never rotate: existing codes would stop working. */
  HASH_PEPPER: string;
};

export type AdminSession = { tokenHash: string; csrfToken: string };

/** `session` is set by the admin API middleware only. */
export type AppEnv = { Bindings: Env; Variables: { session: AdminSession } };

export function assertSecrets(env: Env): void {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) throw new Error("SESSION_SECRET must be set (32+ characters)");
  if (!env.HASH_PEPPER || env.HASH_PEPPER.length < 32) throw new Error("HASH_PEPPER must be set (32+ characters)");
}

export const nowIso = () => new Date().toISOString();
export const isoIn = (ms: number) => new Date(Date.now() + ms).toISOString();
