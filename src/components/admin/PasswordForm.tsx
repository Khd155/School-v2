"use client";

import { useState } from "react";
import { Alert } from "../Alert";
import { useAdminApi } from "./AdminContext";

const MIN = 12;

export function PasswordForm() {
  const api = useAdminApi();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (next.length < MIN) return setMessage({ tone: "error", text: `كلمة المرور الجديدة يجب ألا تقل عن ${MIN} حرفًا.` });
    if (next !== confirm) return setMessage({ tone: "error", text: "تأكيد كلمة المرور لا يطابق كلمة المرور الجديدة." });
    setPending(true);
    const res = await api("/api/admin/password", { current, next });
    setPending(false);
    if (!res.ok) {
      return setMessage({
        tone: "error",
        text: res.error === "wrong_current" ? "كلمة المرور الحالية غير صحيحة." : res.message ?? "تعذّر تغيير كلمة المرور.",
      });
    }
    setCurrent("");
    setNext("");
    setConfirm("");
    setMessage({ tone: "success", text: "تم تغيير كلمة المرور." });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="form-grid">
      <div className="field">
        <label className="label" htmlFor="pw-current">كلمة المرور الحالية</label>
        <input id="pw-current" type="password" className="input ltr" dir="ltr" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} disabled={pending} />
      </div>
      <div className="field">
        <label className="label" htmlFor="pw-next">كلمة المرور الجديدة</label>
        <input id="pw-next" type="password" className="input ltr" dir="ltr" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} disabled={pending} aria-describedby="pw-hint" />
        <p className="hint" id="pw-hint">{MIN} حرفًا على الأقل.</p>
      </div>
      <div className="field">
        <label className="label" htmlFor="pw-confirm">تأكيد كلمة المرور الجديدة</label>
        <input id="pw-confirm" type="password" className="input ltr" dir="ltr" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={pending} />
      </div>
      <div aria-live="polite">{message && <Alert tone={message.tone}>{message.text}</Alert>}</div>
      <div className="actions">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending && <span className="spinner" aria-hidden="true" />}
          حفظ كلمة المرور
        </button>
      </div>
    </form>
  );
}
