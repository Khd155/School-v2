import { NextResponse } from "next/server";
import { REPORT_COOKIE, reportCookieOptions } from "@/lib/server/report-session";
import { isSameOrigin, jsonError } from "@/lib/server/request";

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return jsonError(403, "forbidden");
  const res = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  res.cookies.set(REPORT_COOKIE, "", reportCookieOptions(0));
  return res;
}
