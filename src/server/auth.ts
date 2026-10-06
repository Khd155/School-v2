import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { generateAccessCode, hashAccessCode, hashPassword, randomToken, safeEqual, sha256Hex, signPayload, verifyPassword, verifyPayload } from "./crypto";
import { isoIn, nowIso, type AdminSession, type AppEnv, type Env } from "./env";

type Ctx = Context<AppEnv>;

/* ------------------------------------------------------------------ */
/* Access codes                                                         */
/* ------------------------------------------------------------------ */

export type IssuedCode = { email: string; code: string };

/**
 * Issues fresh codes. Only the hash is stored; plain codes are returned once
 * for the teacher to export. Bumping `version` ends parent sessions opened
 * with the previous code.
 */
export async function issueCodes(env: Env, emails: string[]): Promise<IssuedCode[]> {
  if (emails.length === 0) return [];
  const now = nowIso();
  const issued = await Promise.all(
    emails.map(async (email) => {
      const code = generateAccessCode();
      return { email, code, hash: await hashAccessCode(env.HASH_PEPPER, email, code) };
    }),
  );
  // One statement for all rows (json_each) keeps us far below the per-request query limit.
  // "WHERE true" is required by SQLite to parse an UPSERT that reads from a SELECT.
  await env.DB.prepare(
    `INSERT INTO access_codes (email, code_hash, generated_at, version)
     SELECT json_extract(value, '$.e'), json_extract(value, '$.h'), ?1, 1 FROM json_each(?2) WHERE true
     ON CONFLICT (email) DO UPDATE SET code_hash = excluded.code_hash, generated_at = excluded.generated_at, version = access_codes.version + 1`,
  )
    .bind(now, JSON.stringify(issued.map((i) => ({ e: i.email, h: i.hash }))))
    .run();
  return issued.map(({ email, code }) => ({ email, code }));
}

/** Returns the code version on success. Same work whether or not the e-mail exists. */
export async function verifyAccessCode(env: Env, email: string, code: string): Promise<number | null> {
  const [row, hash] = await Promise.all([
    env.DB.prepare("SELECT code_hash, version FROM access_codes WHERE email = ?").bind(email).first<{ code_hash: string; version: number }>(),
    hashAccessCode(env.HASH_PEPPER, email, code),
  ]);
  const ok = safeEqual(hash, row?.code_hash ?? "0".repeat(64));
  return row && ok ? row.version : null;
}

/* ------------------------------------------------------------------ */
/* Parent (report) session                                              */
/* ------------------------------------------------------------------ */

export const REPORT_COOKIE = "__Host-report";
const REPORT_TTL_SECONDS = 30 * 60;
/** v = access-code version, or 0 for a session opened while codes were not required. */
type ReportToken = { e: string; v: number; exp: number };

const cookieBase = { httpOnly: true, secure: true, sameSite: "Strict", path: "/" } as const;

export async function startReportSession(c: Ctx, email: string, codeVersion: number) {
  const token = await signPayload(c.env.SESSION_SECRET, { e: email, v: codeVersion, exp: Math.floor(Date.now() / 1000) + REPORT_TTL_SECONDS } satisfies ReportToken);
  setCookie(c, REPORT_COOKIE, token, { ...cookieBase, maxAge: REPORT_TTL_SECONDS });
}

export function endReportSession(c: Ctx) {
  setCookie(c, REPORT_COOKIE, "", { ...cookieBase, maxAge: 0 });
}

/**
 * E-mail of the verified student, or null if missing or expired, if the code was
 * re-issued, or if it was opened without a code and codes are now required again.
 */
export async function readReportSession(c: Ctx): Promise<string | null> {
  const token = await verifyPayload<ReportToken>(c.env.SESSION_SECRET, getCookie(c, REPORT_COOKIE));
  if (!token || typeof token.e !== "string" || token.exp * 1000 < Date.now()) return null;
  if (token.v === 0) {
    const s = await c.env.DB.prepare("SELECT require_access_code FROM app_settings WHERE id = 1").first<{ require_access_code: number }>();
    return s?.require_access_code === 0 ? token.e : null;
  }
  const row = await c.env.DB.prepare("SELECT version FROM access_codes WHERE email = ?").bind(token.e).first<{ version: number }>();
  return row?.version === token.v ? token.e : null;
}

/* ------------------------------------------------------------------ */
/* Teacher (admin) session                                              */
/* ------------------------------------------------------------------ */

export const ADMIN_COOKIE = "__Host-admin";
const ADMIN_SESSION_HOURS = 12;
export const MIN_PASSWORD_LENGTH = 12;

export type { AdminSession };

/**
 * First successful login uses ADMIN_PASSWORD from the environment and stores
 * its hash; from then on only the stored hash is used.
 */
export async function verifyAdminPassword(env: Env, password: string): Promise<boolean> {
  const row = await env.DB.prepare("SELECT password_hash FROM admin_credentials WHERE id = 1").first<{ password_hash: string }>();
  if (row) return verifyPassword(env.HASH_PEPPER, password, row.password_hash);

  const initial = env.ADMIN_PASSWORD ?? "";
  if (initial.length < MIN_PASSWORD_LENGTH) {
    console.error(`ADMIN_PASSWORD is not configured or shorter than ${MIN_PASSWORD_LENGTH} characters`);
    return false;
  }
  if (!safeEqual(password, initial)) return false;
  await env.DB.prepare("INSERT INTO admin_credentials (id, password_hash, updated_at) VALUES (1, ?, ?) ON CONFLICT (id) DO NOTHING")
    .bind(await hashPassword(env.HASH_PEPPER, password), nowIso())
    .run();
  return true;
}

export async function startAdminSession(c: Ctx): Promise<void> {
  const token = randomToken();
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM admin_sessions WHERE expires_at < ?").bind(nowIso()),
    c.env.DB.prepare("INSERT INTO admin_sessions (token_hash, csrf_token, created_at, expires_at) VALUES (?, ?, ?, ?)").bind(
      await sha256Hex(token),
      randomToken(),
      nowIso(),
      isoIn(ADMIN_SESSION_HOURS * 3_600_000),
    ),
  ]);
  setCookie(c, ADMIN_COOKIE, token, { ...cookieBase, maxAge: ADMIN_SESSION_HOURS * 3600 });
}

export async function getAdminSession(c: Ctx): Promise<AdminSession | null> {
  const token = getCookie(c, ADMIN_COOKIE);
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const row = await c.env.DB.prepare("SELECT csrf_token FROM admin_sessions WHERE token_hash = ? AND expires_at > ?")
    .bind(tokenHash, nowIso())
    .first<{ csrf_token: string }>();
  return row ? { tokenHash, csrfToken: row.csrf_token } : null;
}

export async function endAdminSession(c: Ctx, session: AdminSession): Promise<void> {
  await c.env.DB.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").bind(session.tokenHash).run();
  setCookie(c, ADMIN_COOKIE, "", { ...cookieBase, maxAge: 0 });
}

/** Changes the password and signs out every other session. */
export async function changeAdminPassword(env: Env, session: AdminSession, current: string, next: string): Promise<"ok" | "wrong_current"> {
  if (!(await verifyAdminPassword(env, current))) return "wrong_current";
  const hash = await hashPassword(env.HASH_PEPPER, next);
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO admin_credentials (id, password_hash, updated_at) VALUES (1, ?, ?)
       ON CONFLICT (id) DO UPDATE SET password_hash = excluded.password_hash, updated_at = excluded.updated_at`,
    ).bind(hash, nowIso()),
    env.DB.prepare("DELETE FROM admin_sessions WHERE token_hash <> ?").bind(session.tokenHash),
  ]);
  return "ok";
}
