"use client";

import { createContext, useCallback, useContext } from "react";

const CsrfContext = createContext<string>("");

export function AdminProvider({ csrfToken, children }: { csrfToken: string; children: React.ReactNode }) {
  return <CsrfContext.Provider value={csrfToken}>{children}</CsrfContext.Provider>;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string; message?: string; body: Record<string, unknown> };

/** POST to an admin API route with the CSRF header. Never throws. */
export function useAdminApi() {
  const csrf = useContext(CsrfContext);
  return useCallback(
    async function call<T = Record<string, unknown>>(url: string, body: FormData | object): Promise<ApiResult<T>> {
      try {
        const isForm = body instanceof FormData;
        const res = await fetch(url, {
          method: "POST",
          headers: { "x-csrf-token": csrf, ...(isForm ? {} : { "Content-Type": "application/json" }) },
          body: isForm ? body : JSON.stringify(body),
        });
        const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (res.status === 401) {
          window.location.href = "/admin/login";
        }
        if (!res.ok) {
          return { ok: false, status: res.status, error: String(json.error ?? "error"), message: json.message as string | undefined, body: json };
        }
        return { ok: true, data: json as T };
      } catch {
        return { ok: false, status: 0, error: "network", message: "تعذّر الاتصال بالخادم. تحقق من الاتصال ثم حاول مرة أخرى.", body: {} };
      }
    },
    [csrf],
  );
}
