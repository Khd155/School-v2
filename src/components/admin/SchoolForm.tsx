"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAdminApi } from "./AdminContext";
import type { SchoolInfo } from "@/lib/types";

type Settings = Omit<SchoolInfo, "logos">;
type LogoKind = "ministry" | "school";
type LogoState = { file: File | null; previewUrl: string | null; remove: boolean };

const MAX_LOGO = 1024 * 1024;
const LOGO_TYPES = ["image/png", "image/webp", "image/svg+xml"];

export function SchoolForm({ initial, logos }: { initial: Settings; logos: SchoolInfo["logos"] }) {
  const api = useAdminApi();
  const router = useRouter();
  const [values, setValues] = useState({ ...initial, enabledClasses: initial.enabledClasses.join("، ") });
  const [logoState, setLogoState] = useState<Record<LogoKind, LogoState>>({
    ministry: { file: null, previewUrl: null, remove: false },
    school: { file: null, previewUrl: null, remove: false },
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<{ tone: "success" | "error" | "idle"; text: string }>({ tone: "idle", text: "" });
  const [pending, setPending] = useState(false);

  const set = (key: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setValues((v) => ({ ...v, [key]: e.target.value }));
    setStatus({ tone: "idle", text: "" });
  };

  function pickLogo(kind: LogoKind, file: File | null) {
    setErrors((e) => ({ ...e, [`${kind}Logo`]: "" }));
    if (file && !LOGO_TYPES.includes(file.type)) {
      setErrors((e) => ({ ...e, [`${kind}Logo`]: "الصيغ المقبولة: PNG أو WebP أو SVG." }));
      return;
    }
    if (file && file.size > MAX_LOGO) {
      setErrors((e) => ({ ...e, [`${kind}Logo`]: "حجم الشعار يتجاوز 1 ميجابايت." }));
      return;
    }
    setLogoState((s) => {
      if (s[kind].previewUrl) URL.revokeObjectURL(s[kind].previewUrl!);
      return { ...s, [kind]: { file, previewUrl: file ? URL.createObjectURL(file) : null, remove: false } };
    });
    setStatus({ tone: "idle", text: "" });
  }

  function removeLogo(kind: LogoKind) {
    setLogoState((s) => {
      if (s[kind].previewUrl) URL.revokeObjectURL(s[kind].previewUrl!);
      return { ...s, [kind]: { file: null, previewUrl: null, remove: true } };
    });
    setStatus({ tone: "idle", text: "" });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setErrors({});
    const form = new FormData();
    for (const [k, v] of Object.entries(values)) form.append(k, String(v));
    for (const kind of ["ministry", "school"] as LogoKind[]) {
      const s = logoState[kind];
      if (s.remove) form.append(`${kind}Remove`, "1");
      else if (s.file) form.append(`${kind}Logo`, s.file);
    }
    const res = await api<{ changed: boolean }>("/api/admin/school", form);
    setPending(false);
    if (!res.ok) {
      if (res.body.errors) setErrors(res.body.errors as Record<string, string>);
      setStatus({ tone: "error", text: res.message ?? "تحقق من الحقول المشار إليها." });
      return;
    }
    setStatus({ tone: "success", text: res.data.changed ? "حُفظت التعديلات وظهرت في الصفحة العامة والتقرير." : "لا توجد تعديلات للحفظ." });
    setLogoState({
      ministry: { file: null, previewUrl: null, remove: false },
      school: { file: null, previewUrl: null, remove: false },
    });
    router.refresh();
  }

  const text = (key: Exclude<keyof Settings, "enabledClasses" | "footerText">, label: string, opts: { required?: boolean; hint?: string; span?: boolean } = {}) => (
    <div className={`field${opts.span ? " span-2" : ""}`}>
      <label className="label" htmlFor={key}>
        {label} {!opts.required && <span className="optional">(اختياري)</span>}
      </label>
      <input
        id={key}
        className="input"
        value={values[key]}
        onChange={set(key)}
        required={opts.required}
        aria-invalid={!!errors[key]}
        aria-describedby={opts.hint ? `${key}-hint` : undefined}
        disabled={pending}
      />
      {opts.hint && (
        <p className="hint" id={`${key}-hint`}>
          {opts.hint}
        </p>
      )}
      {errors[key] && <p className="field-error">{errors[key]}</p>}
    </div>
  );

  return (
    <form onSubmit={onSubmit} noValidate>
      <section className="panel admin-section" aria-labelledby="sec-school">
        <div className="admin-section-head">
          <h2 id="sec-school">المدرسة</h2>
        </div>
        <div className="form-grid form-grid-2">
          {text("schoolName", "اسم المدرسة", { required: true, span: true })}
          {text("educationOffice", "إدارة التعليم / مكتب التعليم", { span: true })}
        </div>
      </section>

      <section className="panel admin-section" aria-labelledby="sec-term">
        <div className="admin-section-head">
          <h2 id="sec-term">المادة والفصل الدراسي</h2>
        </div>
        <div className="form-grid form-grid-2">
          {text("academicYear", "العام الدراسي", { hint: "مثال: 1448هـ" })}
          {text("term", "الفصل الدراسي", { hint: "مثال: الفصل الدراسي الأول" })}
          {text("subject", "اسم المادة", { required: true })}
          {text("grade", "الصف", { required: true, hint: "يظهر بعد كلمة «الصف»، مثال: السادس" })}
          <div className="field">
            <label className="label" htmlFor="enabledClasses">
              الفصول المفعّلة
            </label>
            <input
              id="enabledClasses"
              className="input"
              inputMode="numeric"
              value={values.enabledClasses}
              onChange={set("enabledClasses")}
              aria-invalid={!!errors.enabledClasses}
              aria-describedby="classes-hint"
              disabled={pending}
            />
            <p className="hint" id="classes-hint">
              أرقام الفصول مفصولة بفاصلة، مثال: 4، 5، 6. يُرفض عند الاستيراد أي طالب في فصل غير مفعّل.
            </p>
            {errors.enabledClasses && <p className="field-error">{errors.enabledClasses}</p>}
          </div>
          {text("teacherName", "اسم المعلم")}
        </div>
      </section>

      <section className="panel admin-section" aria-labelledby="sec-logos">
        <div className="admin-section-head">
          <div>
            <h2 id="sec-logos">الشعارات</h2>
            <p>PNG أو WebP أو SVG بحد أقصى 1 ميجابايت. يُفضّل خلفية شفافة. إذا لم يُرفع شعار يظهر الرأس نصيًا.</p>
          </div>
        </div>
        <div className="logo-fields">
          <LogoField
            kind="ministry"
            label="شعار وزارة التعليم"
            currentUrl={logos.ministry}
            state={logoState.ministry}
            error={errors.ministryLogo}
            disabled={pending}
            onPick={pickLogo}
            onRemove={removeLogo}
            onUndo={() => setLogoState((s) => ({ ...s, ministry: { file: null, previewUrl: null, remove: false } }))}
          />
          <LogoField
            kind="school"
            label="شعار المدرسة"
            currentUrl={logos.school}
            state={logoState.school}
            error={errors.schoolLogo}
            disabled={pending}
            onPick={pickLogo}
            onRemove={removeLogo}
            onUndo={() => setLogoState((s) => ({ ...s, school: { file: null, previewUrl: null, remove: false } }))}
          />
        </div>
      </section>

      <section className="panel admin-section" aria-labelledby="sec-footer">
        <div className="admin-section-head">
          <h2 id="sec-footer">تذييل التقرير</h2>
        </div>
        <div className="field">
          <label className="label" htmlFor="footerText">
            نص التذييل <span className="optional">(اختياري)</span>
          </label>
          <textarea id="footerText" className="textarea" value={values.footerText} onChange={set("footerText")} maxLength={500} disabled={pending} aria-invalid={!!errors.footerText} />
          <p className="hint">يظهر أسفل التقرير المطبوع وملف PDF. مثال: للاستفسار تواصل مع معلم المادة عبر منصة مدرستي.</p>
          {errors.footerText && <p className="field-error">{errors.footerText}</p>}
        </div>
      </section>

      <div className="form-footer">
        <p className={`form-status${status.tone !== "idle" ? ` is-${status.tone}` : ""}`} role="status">
          {status.text || "التعديلات لا تُطبّق قبل الحفظ."}
        </p>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending && <span className="spinner" aria-hidden="true" />}
          {pending ? "جارٍ الحفظ…" : "حفظ التعديلات"}
        </button>
      </div>
    </form>
  );
}

type LogoFieldProps = {
  kind: LogoKind;
  label: string;
  currentUrl: string | null;
  state: LogoState;
  error?: string;
  disabled: boolean;
  onPick: (kind: LogoKind, file: File | null) => void;
  onRemove: (kind: LogoKind) => void;
  onUndo: () => void;
};

function LogoField({ kind, label, currentUrl, state, error, disabled, onPick, onRemove, onUndo }: LogoFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const shown = state.remove ? null : state.previewUrl ?? currentUrl;
  const changed = state.remove || !!state.file;

  useEffect(() => {
    if (!state.file && inputRef.current) inputRef.current.value = "";
  }, [state.file]);

  return (
    <div className="logo-field">
      <span className="label" id={`${kind}-label`}>
        {label} <span className="optional">(اختياري)</span>
      </span>
      <div className="logo-preview" aria-live="polite">
        {shown ? <img src={shown} alt={`معاينة ${label}`} /> : <span>{state.remove ? "سيُحذف عند الحفظ" : "لا يوجد شعار"}</span>}
      </div>
      {state.file && <p className="hint">معاينة — لم يُحفظ بعد.</p>}
      <div className="actions">
        <label className="btn btn-secondary btn-sm" aria-disabled={disabled}>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/webp,image/svg+xml"
            className="visually-hidden"
            aria-labelledby={`${kind}-label`}
            disabled={disabled}
            onChange={(e) => onPick(kind, e.target.files?.[0] ?? null)}
          />
          {currentUrl || state.file ? "استبدال" : "رفع شعار"}
        </label>
        {(currentUrl || state.file) && !state.remove && (
          <button type="button" className="btn btn-danger btn-sm" onClick={() => onRemove(kind)} disabled={disabled}>
            حذف
          </button>
        )}
        {changed && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onUndo} disabled={disabled}>
            تراجع
          </button>
        )}
      </div>
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}
