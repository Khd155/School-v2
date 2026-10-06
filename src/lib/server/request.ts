import "server-only";
import { NextResponse } from "next/server";

/**
 * Client IP. On Vercel `x-real-ip` / the first `x-forwarded-for` hop are set by
 * the platform edge and cannot be spoofed by the client.
 */
export function clientIp(req: Request): string {
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return "unknown";
}

/** Rejects cross-site state-changing requests (CSRF defence layer 1; the CSRF token is layer 2). */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return !!host && new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...extra }, { status, headers: { "Cache-Control": "no-store" } });
}

export function jsonOk(body: unknown = { ok: true }, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: { "Cache-Control": "no-store", ...(init?.headers ?? {}) },
  });
}

export const isProduction = process.env.NODE_ENV === "production";
