import { PageHead } from "./AdminLayout";
import { formatDateTimeRiyadh } from "../../shared/format";
import type { SchoolInfo } from "../../shared/types";

type Settings = Omit<SchoolInfo, "logos">;
type Props = { settings: Settings; logos: SchoolInfo["logos"]; log: { changedAt: string; summary: string }[] };

type TextKey = Exclude<keyof Settings, "enabledClasses" | "footerText">;

function TextField({ name, label, value, required, hint, span, max }: { name: TextKey; label: string; value: string; required?: boolean; hint?: string; span?: boolean; max: number }) {
  return (
    <div class={`field${span ? " span-2" : ""}`}>
      <label class="label" for={name}>
        {label} {!required && <span class="optional">(اختياري)</span>}
      </label>
      <input id={name} name={name} class="input" value={value} required={required} maxlength={max} aria-describedby={hint ? `${name}-hint` : undefined} />
      {hint && (
        <p class="hint" id={`${name}-hint`}>
          {hint}
        </p>
      )}
      <p class="field-error" data-error-for={name} hidden></p>
    </div>
  );
}

function LogoField({ kind, label, url }: { kind: "ministry" | "school"; label: string; url: string | null }) {
  return (
    <div class="logo-field" data-logo={kind} data-current={url ?? ""}>
      <span class="label" id={`${kind}-label`}>
        {label} <span class="optional">(اختياري)</span>
      </span>
      <div class="logo-preview" aria-live="polite">
        {url ? <img src={url} alt={label} /> : <span>لا يوجد شعار</span>}
      </div>
      <p class="hint" data-pending hidden>
        معاينة — لم يُحفظ بعد.
      </p>
      <div class="actions">
        <label class="btn btn-secondary btn-sm">
          <input type="file" accept="image/png,image/webp,image/svg+xml" class="visually-hidden" aria-labelledby={`${kind}-label`} data-logo-input />
          <span data-pick-label>{url ? "استبدال" : "رفع شعار"}</span>
        </label>
        <button type="button" class="btn btn-danger btn-sm" data-logo-remove hidden={!url}>
          حذف
        </button>
        <button type="button" class="btn btn-ghost btn-sm" data-logo-undo hidden>
          تراجع
        </button>
      </div>
      <p class="field-error" data-error-for={`${kind}Logo`} hidden></p>
    </div>
  );
}

export function SchoolContent({ settings, logos, log }: Props) {
  return (
    <>
      <PageHead title="معلومات المدرسة">
        تظهر هذه البيانات في رأس صفحة الاستعلام وفي التقرير والطباعة وملف PDF. تعديلها لا يغيّر «آخر تحديث للبيانات»، فهو خاص ببيانات الطلاب.
      </PageHead>
      <form id="school-form" novalidate>
        <section class="panel admin-section" aria-labelledby="sec-school">
          <div class="admin-section-head">
            <h2 id="sec-school">المدرسة</h2>
          </div>
          <div class="form-grid form-grid-2">
            <TextField name="schoolName" label="اسم المدرسة" value={settings.schoolName} required span max={120} />
            <TextField name="educationOffice" label="إدارة التعليم / مكتب التعليم" value={settings.educationOffice} span max={160} />
          </div>
        </section>

        <section class="panel admin-section" aria-labelledby="sec-term">
          <div class="admin-section-head">
            <h2 id="sec-term">المادة والفصل الدراسي</h2>
          </div>
          <div class="form-grid form-grid-2">
            <TextField name="academicYear" label="العام الدراسي" value={settings.academicYear} hint="مثال: 1448هـ" max={40} />
            <TextField name="term" label="الفصل الدراسي" value={settings.term} hint="مثال: الفصل الدراسي الأول" max={60} />
            <TextField name="subject" label="اسم المادة" value={settings.subject} required max={80} />
            <TextField name="grade" label="الصف" value={settings.grade} required hint="يظهر بعد كلمة «الصف»، مثال: السادس" max={40} />
            <div class="field">
              <label class="label" for="enabledClasses">
                الفصول المفعّلة
              </label>
              <input id="enabledClasses" name="enabledClasses" class="input" inputmode="numeric" value={settings.enabledClasses.join("، ")} aria-describedby="classes-hint" maxlength={80} />
              <p class="hint" id="classes-hint">
                أرقام الفصول مفصولة بفاصلة، مثال: 4، 5، 6. يُرفض عند الاستيراد أي طالب في فصل غير مفعّل.
              </p>
              <p class="field-error" data-error-for="enabledClasses" hidden></p>
            </div>
            <TextField name="teacherName" label="اسم المعلم" value={settings.teacherName} max={80} />
          </div>
        </section>

        <section class="panel admin-section" aria-labelledby="sec-logos">
          <div class="admin-section-head">
            <div>
              <h2 id="sec-logos">الشعارات</h2>
              <p>PNG أو WebP أو SVG بحد أقصى 1 ميجابايت. يُفضّل خلفية شفافة. إذا لم يُرفع شعار يظهر الرأس نصيًا.</p>
            </div>
          </div>
          <div class="logo-fields">
            <LogoField kind="ministry" label="شعار وزارة التعليم" url={logos.ministry} />
            <LogoField kind="school" label="شعار المدرسة" url={logos.school} />
          </div>
        </section>

        <section class="panel admin-section" aria-labelledby="sec-footer">
          <div class="admin-section-head">
            <h2 id="sec-footer">تذييل التقرير</h2>
          </div>
          <div class="field">
            <label class="label" for="footerText">
              نص التذييل <span class="optional">(اختياري)</span>
            </label>
            <textarea id="footerText" name="footerText" class="textarea" maxlength={500}>
              {settings.footerText}
            </textarea>
            <p class="hint">يظهر أسفل التقرير المطبوع وملف PDF. مثال: للاستفسار تواصل مع معلم المادة عبر منصة مدرستي.</p>
            <p class="field-error" data-error-for="footerText" hidden></p>
          </div>
        </section>

        <div class="form-footer">
          <p class="form-status" id="form-status" role="status">
            التعديلات لا تُطبّق قبل الحفظ.
          </p>
          <button type="submit" class="btn btn-primary">
            <span class="spinner" aria-hidden="true" hidden></span>
            <span class="btn-label">حفظ التعديلات</span>
          </button>
        </div>
      </form>

      <section class="panel admin-section" aria-labelledby="log-title" style="margin-top: var(--space-5)">
        <div class="admin-section-head">
          <h2 id="log-title">سجل التعديلات</h2>
        </div>
        {log.length === 0 ? (
          <p class="hint">لا توجد تعديلات بعد.</p>
        ) : (
          <ul class="log-list">
            {log.map((entry) => (
              <li>
                <time datetime={entry.changedAt}>{formatDateTimeRiyadh(entry.changedAt)}</time>
                <span>{entry.summary}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
