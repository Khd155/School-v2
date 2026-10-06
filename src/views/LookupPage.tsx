import { Alert } from "./Alert";
import { Document } from "./Layout";
import { Masthead } from "./Masthead";
import { formatClassList, formatDateTimeRiyadh } from "../shared/format";
import type { SchoolInfo } from "../shared/types";

export function LookupPage({ school, published, dataUpdatedAt }: { school: SchoolInfo; published: boolean; dataUpdatedAt: string | null }) {
  return (
    <Document title="استعلام التحصيل الدراسي" scripts={published ? ["lookup"] : []}>
      <main class="public-main" id="main">
        <div class="lookup">
          <Masthead school={school} />

          <section class="panel lookup-panel" aria-labelledby="lookup-title">
            <h1 class="lookup-title" id="lookup-title">
              استعلام التحصيل الدراسي
            </h1>
            <p class="lookup-intro">
              مادة <strong>{school.subject}</strong> لطلاب <strong>الصف {school.grade}</strong>
              {school.enabledClasses.length > 0 && (
                <>
                  {" "}— {school.enabledClasses.length > 1 ? "الفصول" : "الفصل"} {formatClassList(school.enabledClasses)}
                </>
              )}
              .
            </p>

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
                    placeholder="name@school.edu.sa"
                    maxlength={254}
                  />
                  <p class="field-error" id="email-error" hidden></p>
                </div>

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
          </section>

          {published && dataUpdatedAt && (
            <div class="lookup-meta">
              <p>
                آخر تحديث للبيانات: <strong>{formatDateTimeRiyadh(dataUpdatedAt)}</strong>
              </p>
              <p class="lookup-privacy">لا تُعرض نتيجة أي طالب إلا بالبريد المدرسي ورمز الوصول معًا.</p>
            </div>
          )}
        </div>
      </main>
    </Document>
  );
}
