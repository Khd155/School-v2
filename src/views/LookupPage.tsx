import { Alert } from "./Alert";
import { Document } from "./Layout";
import { SiteHeader } from "./SiteHeader";
import { formatDateTimeRiyadh } from "../shared/format";
import type { SchoolInfo } from "../shared/types";

export function LookupPage({ school, published, dataUpdatedAt }: { school: SchoolInfo; published: boolean; dataUpdatedAt: string | null }) {
  return (
    <Document title="استعلام التحصيل الدراسي" scripts={published ? ["lookup"] : []}>
      <SiteHeader school={school} />
      <main class="public-main lookup-main" id="main">
        <div class="lookup">
          <div class="lookup-hero">
            <h1 id="lookup-title">استعلام التحصيل الدراسي</h1>
            <p>أدخل البريد المدرسي للطالب لعرض تقرير تحصيله وطباعته.</p>
          </div>

          <section class="panel lookup-panel" aria-labelledby="lookup-title">
            <dl class="lookup-facts">
              <div>
                <dt>المادة</dt>
                <dd>{school.subject}</dd>
              </div>
              <div>
                <dt>الصف</dt>
                <dd>{school.grade}</dd>
              </div>
            </dl>

            <div class="lookup-body">
            {published ? (
              <form class="lookup-form" id="lookup-form" method="post" action="/api/lookup" novalidate>
                <div class="field">
                  <label class="label" for="email">
                    البريد المدرسي للطالب
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    inputmode="email"
                    autocomplete="off"
                    autocapitalize="off"
                    spellcheck={false}
                    dir="ltr"
                    class="input ltr"
                    placeholder="sXXXXXXXXX@mkhb.moe.gov.sa"
                    maxlength={254}
                  />
                  <p class="field-error" id="email-error" hidden></p>
                </div>

                {school.requireAccessCode && (
                <div class="field">
                  <label class="label" for="code">
                    رمز الوصول
                  </label>
                  <input
                    id="code"
                    name="code"
                    type="text"
                    inputmode="numeric"
                    autocomplete="off"
                    dir="ltr"
                    maxlength={12}
                    class="input ltr code-input"
                    placeholder="0000 0000"
                    aria-describedby="code-hint"
                  />
                  <p class="hint" id="code-hint">
                    رمز من 8 أرقام يسلّمه معلم المادة لكل طالب.
                  </p>
                  <p class="field-error" id="code-error" hidden></p>
                </div>
                )}

                <div id="form-message" aria-live="polite"></div>

                <button type="submit" class="btn btn-primary btn-block lookup-submit">
                  <span class="spinner" aria-hidden="true" hidden></span>
                  <span class="btn-label">عرض التقرير</span>
                </button>
              </form>
            ) : (
              <div class="lookup-empty">
                <Alert tone="info" title="لم تُنشر النتائج بعد">
                  سيتاح الاستعلام بعد أن يعتمد معلم المادة بيانات الطلاب. حاول لاحقًا.
                </Alert>
              </div>
            )}
            </div>
          </section>

          {published && dataUpdatedAt && (
            <div class="lookup-meta">
              <p>
                آخر تحديث للبيانات: <strong>{formatDateTimeRiyadh(dataUpdatedAt)}</strong>
              </p>
              {school.requireAccessCode && <p class="lookup-privacy">لا تُعرض نتيجة أي طالب إلا بالبريد المدرسي ورمز الوصول معًا.</p>}
            </div>
          )}
        </div>
      </main>
      <footer class="site-footer">
        <p>
          {school.schoolName}
          {school.academicYear && ` · العام الدراسي ${school.academicYear}`}
        </p>
        {school.teacherName && <p>للاستفسار عن الدرجات: {school.teacherName}، معلم المادة.</p>}
      </footer>
    </Document>
  );
}
