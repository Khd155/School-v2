import "server-only";
import { cookies } from "next/headers";
import { signPayload, verifyPayload } from "./crypto";
import { getCodeVersion } from "./access-codes";
import { isProduction } from "./request";

/** Parent sessions are short-lived and bound to the access-code version. */
export const REPORT_COOKIE = isProduction ? "__Host-report" : "report";
const TTL_SECONDS = 30 * 60;

type ReportToken = { e: string; v: number; exp: number };

export function reportCookieOptions(maxAge = TTL_SECONDS) {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict" as const,
    path: "/",
    maxAge,
  };
}

export function createReportToken(email: string, codeVersion: number): string {
  return signPayload({ e: email, v: codeVersion, exp: Math.floor(Date.now() / 1000) + TTL_SECONDS } satisfies ReportToken);
}

/** E-mail of the verified student, or null if the session is missing, expired, or the code was re-issued. */
export async function readReportSession(): Promise<string | null> {
  const token = verifyPayload<ReportToken>((await cookies()).get(REPORT_COOKIE)?.value);
  if (!token || typeof token.e !== "string" || token.exp * 1000 < Date.now()) return null;
  const version = await getCodeVersion(token.e);
  return version === token.v ? token.e : null;
}
