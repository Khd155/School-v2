import { createAdminSession, verifyAdminPassword } from "@/lib/server/admin-auth";
import { clearAttempts, consumeAttempt, LIMITS } from "@/lib/server/rate-limit";
import { clientIp, isSameOrigin, jsonError, jsonOk } from "@/lib/server/request";

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return jsonError(403, "forbidden");
  let password = "";
  try {
    const body = await req.json();
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    return jsonError(400, "invalid_request");
  }
  if (!password || password.length > 200) return jsonError(400, "invalid_request");

  try {
    const ip = clientIp(req);
    const ipBlock = await consumeAttempt(LIMITS.adminIp, ip);
    if (ipBlock) return jsonError(429, "rate_limited", { retryAfterMinutes: ipBlock });
    const globalBlock = await consumeAttempt(LIMITS.adminGlobal, "all");
    if (globalBlock) return jsonError(429, "rate_limited", { retryAfterMinutes: globalBlock });

    if (!(await verifyAdminPassword(password))) return jsonError(401, "invalid_credentials");

    await clearAttempts(LIMITS.adminIp, ip);
    await createAdminSession();
    return jsonOk();
  } catch (err) {
    console.error("admin login failed", err);
    return jsonError(500, "server_error");
  }
}
