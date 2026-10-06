"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Alert } from "./Alert";
import { isValidEmail, normalizeAccessCode, normalizeEmail } from "@/lib/access-code-format";

type FieldErrors = { email?: string; code?: string };
type FormError = { title: string; body: string } | null;

export function LookupForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<FormError>(null);
  const [pending, setPending] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const normalizedEmail = normalizeEmail(email);
    const normalizedCode = normalizeAccessCode(code);
    const errors: FieldErrors = {};
    if (!normalizedEmail) errors.email = "أدخل البريد المدرسي للطالب.";
    else if (!isValidEmail(normalizedEmail)) errors.email = "صيغة البريد غير صحيحة. مثال: name@school.edu.sa";
    if (!code.trim()) errors.code = "أدخل رمز الوصول.";
    else if (!normalizedCode) errors.code = "رمز الوصول مكوّن من 8 أرقام.";

    setFieldErrors(errors);
    setFormError(null);
    if (errors.email) return emailRef.current?.focus();
    if (errors.code) return codeRef.current?.focus();

    setPending(true);
    try {
      const res = await fetch("/api/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail, code: normalizedCode }),
      });
      if (res.ok) {
        router.push("/report");
        return; // keep the pending state until navigation completes
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string; retryAfterMinutes?: number };
      setFormError(messageFor(res.status, data));
    } catch {
      setFormError({
        title: "تعذّر الاتصال",
        body: "لم نتمكن من الوصول إلى الخادم. تحقق من اتصالك بالإنترنت ثم حاول مرة أخرى.",
      });
    }
    setPending(false);
  }

  return (
    <form className="lookup-form" onSubmit={onSubmit} noValidate aria-busy={pending}>
      <div className="field">
        <label className="label" htmlFor="email">
          البريد المدرسي للطالب
        </label>
        <input
          ref={emailRef}
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          dir="ltr"
          className="input ltr"
          placeholder="name@school.edu.sa"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={!!fieldErrors.email}
          aria-describedby={fieldErrors.email ? "email-error" : undefined}
          disabled={pending}
        />
        {fieldErrors.email && (
          <p className="field-error" id="email-error">
            {fieldErrors.email}
          </p>
        )}
      </div>

      <div className="field">
        <label className="label" htmlFor="code">
          رمز الوصول
        </label>
        <input
          ref={codeRef}
          id="code"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          dir="ltr"
          maxLength={12}
          className="input ltr code-input"
          placeholder="0000 0000"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          aria-invalid={!!fieldErrors.code}
          aria-describedby={fieldErrors.code ? "code-error code-hint" : "code-hint"}
          disabled={pending}
        />
        <p className="hint" id="code-hint">
          رمز من 8 أرقام يسلّمه معلم المادة لكل طالب.
        </p>
        {fieldErrors.code && (
          <p className="field-error" id="code-error">
            {fieldErrors.code}
          </p>
        )}
      </div>

      <div aria-live="polite">
        {formError && (
          <Alert tone="error" title={formError.title}>
            {formError.body}
          </Alert>
        )}
      </div>

      <button type="submit" className="btn btn-primary btn-block lookup-submit" disabled={pending}>
        {pending && <span className="spinner" aria-hidden="true" />}
        {pending ? "جارٍ الاستعلام…" : "عرض التقرير"}
      </button>
    </form>
  );
}

function messageFor(status: number, data: { error?: string; retryAfterMinutes?: number }): FormError {
  if (status === 401) {
    return {
      title: "تعذّر التحقق",
      body: "البريد أو رمز الوصول غير صحيح. تأكد منهما ثم حاول مرة أخرى.",
    };
  }
  if (status === 404) {
    return {
      title: "لا توجد نتيجة",
      body: "تم التحقق بنجاح، لكن لا توجد نتيجة مسجلة لهذا الطالب حاليًا. تواصل مع معلم المادة.",
    };
  }
  if (status === 429) {
    const minutes = data.retryAfterMinutes ?? 15;
    return {
      title: "تجاوزت عدد المحاولات",
      body: `لحماية بيانات الطلاب أُوقفت المحاولات مؤقتًا. حاول مرة أخرى بعد ${minutes} ${minutes <= 10 && minutes > 2 ? "دقائق" : "دقيقة"}.`,
    };
  }
  if (status === 400) {
    return { title: "بيانات غير مكتملة", body: "تحقق من البريد ورمز الوصول ثم حاول مرة أخرى." };
  }
  return {
    title: "حدث خطأ غير متوقع",
    body: "تعذّر إكمال الطلب الآن. حاول مرة أخرى بعد قليل.",
  };
}
