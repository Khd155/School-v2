import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import { getDummyHash, hashSecret, randomToken, safeEqualStrings, sha256, verifySecret } from "./crypto";
import { isProduction, isSameOrigin, jsonError } from "./request";

export const ADMIN_COOKIE = isProduction ? "__Host-admin" : "admin";
const SESSION_HOURS = 12;
export const MIN_PASSWORD_LENGTH = 12;

export type AdminSession = { tokenHash: string; csrfToken: string };

/**
 * The first successful login uses ADMIN_PASSWORD from the environment and
 * stores its scrypt hash; from then on only the stored hash is used.
 */
export async function verifyAdminPassword(password: string): Promise<boolean> {
  const [row] = await db()`select password_hash from admin_credentials where id = 1`;
  if (row) return verifySecret(password, row.password_hash);

  const initial = process.env.ADMIN_PASSWORD ?? "";
  if (initial.length < MIN_PASSWORD_LENGTH) {
    console.error(`ADMIN_PASSWORD is not configured or shorter than ${MIN_PASSWORD_LENGTH} characters`);
    await verifySecret(password, await getDummyHash());
    return false;
  }
  if (!safeEqualStrings(password, initial)) {
    await verifySecret(password, await getDummyHash());
    return false;
  }
  await db()`insert into admin_credentials (id, password_hash) values (1, ${await hashSecret(password)}) on conflict (id) do nothing`;
  return true;
}

export async function createAdminSession(): Promise<void> {
  const token = randomToken();
  const csrf = randomToken();
  await db()`delete from admin_sessions where expires_at < now()`;
  await db()`
    insert into admin_sessions (token_hash, csrf_token, expires_at)
    values (${sha256(token)}, ${csrf}, now() + ${`${SESSION_HOURS} hours`}::interval)
  `;
  (await cookies()).set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_HOURS * 3600,
  });
}

export async function getAdminSession(): Promise<AdminSession | null> {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  const tokenHash = sha256(token);
  const [row] = await db()`
    select csrf_token from admin_sessions where token_hash = ${tokenHash} and expires_at > now()
  `;
  return row ? { tokenHash, csrfToken: row.csrf_token } : null;
}

/** For admin pages: redirects to the login page when not signed in. */
export async function requireAdminPage(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  return session;
}

/**
 * For admin API routes: same-origin check + valid session + matching CSRF
 * token header. Returns the session, or a ready error response.
 */
export async function requireAdminApi(req: Request): Promise<AdminSession | Response> {
  if (!isSameOrigin(req)) return jsonError(403, "forbidden");
  const session = await getAdminSession();
  if (!session) return jsonError(401, "unauthorized");
  const header = req.headers.get("x-csrf-token") ?? "";
  if (!safeEqualStrings(header, session.csrfToken)) return jsonError(403, "forbidden");
  return session;
}

export async function destroyAdminSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(ADMIN_COOKIE)?.value;
  if (token) await db()`delete from admin_sessions where token_hash = ${sha256(token)}`;
  jar.delete(ADMIN_COOKIE);
}

/** Changes the password and signs out every other session. */
export async function changeAdminPassword(session: AdminSession, current: string, next: string): Promise<"ok" | "wrong_current"> {
  if (!(await verifyAdminPassword(current))) return "wrong_current";
  const hash = await hashSecret(next);
  await db().begin(async (tx) => {
    await tx`
      insert into admin_credentials (id, password_hash, updated_at) values (1, ${hash}, now())
      on conflict (id) do update set password_hash = excluded.password_hash, updated_at = now()
    `;
    await tx`delete from admin_sessions where token_hash <> ${session.tokenHash}`;
  });
  return "ok";
}
