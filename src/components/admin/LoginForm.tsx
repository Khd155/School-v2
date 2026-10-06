"use client";

import { useState } from "react";
import { Alert } from "../Alert";

export function LoginForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) return setError("أدخل كلمة المرور.");
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        window.location.href = "/admin";
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) setError("كلمة المرور غير صحيحة.");
      else if (res.status === 429) setError(`تجاوزت عدد المحاولات. حاول بعد ${data.retryAfterMinutes ?? 15} دقيقة.`);
      else setError("تعذّر تسجيل الدخول الآن. حاول مرة أخرى.");
    } catch {
      setError("تعذّر الاتصال بالخادم.");
    }
    setPending(false);
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="field">
        <label className="label" htmlFor="password">
          كلمة المرور
        </label>
        <input
          id="password"
          type="password"
          className="input ltr"
          dir="ltr"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={pending}
          aria-invalid={!!error}
        />
      </div>
      <div aria-live="polite">{error && <Alert tone="error">{error}</Alert>}</div>
      <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
        {pending && <span className="spinner" aria-hidden="true" />}
        {pending ? "جارٍ الدخول…" : "دخول"}
      </button>
    </form>
  );
}
