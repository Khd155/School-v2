import { NextResponse } from "next/server";
import { isValidEmail, normalizeAccessCode, normalizeEmail } from "@/lib/access-code-format";
import { verifyAccessCode } from "@/lib/server/access-codes";
import { clearAttempts, consumeAttempt, LIMITS, pruneRateLimits } from "@/lib/server/rate-limit";
import { createReportToken, REPORT_COOKIE, reportCookieOptions } from "@/lib/server/report-session";
import { clientIp, isSameOrigin, jsonError } from "@/lib/server/request";
import { getStudentReport } from "@/lib/server/students";

export const dynamic = "force-dynamic";

/**
 * Verifies e-mail + access code. Responses never reveal whether the e-mail
 * exists: an unknown e-mail and a wrong code both return the same 401.
 */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return jsonError(403, "forbidden");

  let body: { email?: unknown; code?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "invalid_request");
  }
  const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
  const code = typeof body.code === "string" ? normalizeAccessCode(body.code) : null;
  if (!isValidEmail(email) || !code) return jsonError(400, "invalid_request");

  try {
    const ipBlock = await consumeAttempt(LIMITS.lookupIp, clientIp(req));
    if (ipBlock) return jsonError(429, "rate_limited", { retryAfterMinutes: ipBlock });
    const emailBlock = await consumeAttempt(LIMITS.lookupEmail, email);
    if (emailBlock) return jsonError(429, "rate_limited", { retryAfterMinutes: emailBlock });

    const codeVersion = await verifyAccessCode(email, code);
    if (codeVersion === null) return jsonError(401, "invalid_credentials");

    await clearAttempts(LIMITS.lookupEmail, email);
    if (Math.random() < 0.02) void pruneRateLimits().catch(() => {});

    // Identity is verified at this point, so it is safe to say there is no result.
    const report = await getStudentReport(email);
    if (!report) return jsonError(404, "no_result");

    const res = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
    res.cookies.set(REPORT_COOKIE, createReportToken(email, codeVersion), reportCookieOptions());
    return res;
  } catch (err) {
    console.error("lookup failed", err);
    return jsonError(500, "server_error");
  }
}
