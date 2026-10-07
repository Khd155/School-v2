import { Alert } from "../Alert";
import { DownloadIcon, PrintIcon } from "../icons";
import { PageHead } from "./AdminLayout";
import { formatDateRiyadh } from "../../shared/format";
import type { CodeRosterEntry } from "../../server/students";

type Props = { roster: CodeRosterEntry[]; siteUrl: string; schoolName: string; subject: string; grade: string; codesRequired: boolean };

export function CodesContent({ roster, siteUrl, schoolName, subject, grade, codesRequired }: Props) {
  const missing = roster.filter((s) => !s.codeGeneratedAt).length;
  const classes = [...new Set(roster.map((s) => s.classNo))].sort((a, b) => a - b);
  return (
    <>
      <PageHead title="رموز الوصول">
        لكل طالب رمز من 8 أرقام يدخله ولي الأمر مع البريد المدرسي. تُحفظ الرموز مشفّرة ولا يمكن عرضها لاحقًا، لذلك تظهر مرة واحدة فقط عند توليدها:
        نزّلها أو اطبعها فورًا.
      </PageHead>

      {!codesRequired && (
        <div style="margin-bottom: var(--space-5)">
          <Alert tone="warning" title="رمز الوصول غير مطلوب حاليًا">
            يستعلم أولياء الأمور بالبريد المدرسي وحده، فمن يعرف بريد طالب يستطيع رؤية تقريره. يمكنك تفعيل الرمز من صفحة «معلومات المدرسة»، وتعمل
            الرموز المولّدة هنا فور التفعيل.
          </Alert>
        </div>
      )}

      <section class="panel admin-section" aria-labelledby="codes-summary" id="codes-root" data-site-url={siteUrl} data-school={schoolName} data-subject={subject} data-grade={grade}>
        <div class="admin-section-head">
          <div>
            <h2 id="codes-summary">توليد الرموز</h2>
            <p>تبقى الرموز صالحة بعد تحديث بيانات الطلاب ما دام البريد لم يتغير.</p>
          </div>
        </div>
        {roster.length === 0 ? (
          <p class="hint">اعتمد بيانات الطلاب أولًا من صفحة «بيانات الطلاب».</p>
        ) : (
          <div class="stack">
            <dl class="figures">
              <div class="figure">
                <dt>الطلاب في البيانات المنشورة</dt>
                <dd class="num">{roster.length}</dd>
              </div>
              <div class="figure">
                <dt>لديهم رمز</dt>
                <dd class="num" id="count-with">{roster.length - missing}</dd>
              </div>
              <div class="figure">
                <dt>بلا رمز</dt>
                <dd class="num" id="count-missing" style={missing ? "color: var(--warning-text)" : undefined}>
                  {missing}
                </dd>
              </div>
            </dl>
            <div class="actions">
              <button type="button" class="btn btn-primary" id="gen-missing" disabled={missing === 0}>
                <span class="spinner" aria-hidden="true" hidden></span>
                <span class="btn-label">توليد رموز للطلاب بلا رمز ({missing})</span>
              </button>
              <button type="button" class="btn btn-danger" id="gen-all" data-with={String(roster.length - missing)}>
                إعادة توليد رموز الجميع
              </button>
            </div>
          </div>
        )}
        <div id="codes-message" aria-live="polite"></div>
      </section>

      <section class="panel admin-section" aria-labelledby="issued-title" id="issued" hidden>
        <div class="admin-section-head">
          <div>
            <h2 id="issued-title">الرموز الجديدة</h2>
            <p>لن تظهر هذه الرموز مرة أخرى بعد مغادرة الصفحة. نزّلها أو اطبع بطاقات التوزيع الآن.</p>
          </div>
          <div class="actions">
            <button type="button" class="btn btn-primary" id="download-csv">
              <DownloadIcon />
              تنزيل CSV
            </button>
            <button type="button" class="btn btn-secondary" id="print-slips">
              <PrintIcon />
              طباعة بطاقات التوزيع
            </button>
          </div>
        </div>
        <div class="table-wrap table-scroll">
          <table class="table">
            <thead>
              <tr>
                <th>الطالب</th>
                <th class="num">الفصل</th>
                <th>البريد</th>
                <th>الرمز</th>
              </tr>
            </thead>
            <tbody id="issued-body"></tbody>
          </table>
        </div>
        <div class="actions" style="margin-top: var(--space-4)">
          <button type="button" class="btn btn-ghost btn-sm" id="hide-issued">
            إخفاء الرموز
          </button>
        </div>
      </section>

      {roster.length > 0 && (
        <section class="panel admin-section" aria-labelledby="roster-title">
          <div class="admin-section-head">
            <div>
              <h2 id="roster-title">الطلاب</h2>
              <p>«إعادة توليد» تُبطل رمز الطالب السابق فورًا.</p>
            </div>
          </div>
          <div class="filters">
            <label class="visually-hidden" for="roster-search">
              بحث
            </label>
            <input id="roster-search" class="input" placeholder="بحث بالاسم أو البريد" autocomplete="off" />
            <label class="visually-hidden" for="roster-class">
              الفصل
            </label>
            <select id="roster-class" class="select input">
              <option value="all">كل الفصول</option>
              {classes.map((c) => (
                <option value={String(c)}>الفصل {c}</option>
              ))}
            </select>
          </div>
          <div class="table-wrap table-scroll">
            <table class="table">
              <thead>
                <tr>
                  <th>الطالب</th>
                  <th class="num">الفصل</th>
                  <th>البريد</th>
                  <th>الرمز</th>
                  <th>
                    <span class="visually-hidden">الإجراء</span>
                  </th>
                </tr>
              </thead>
              <tbody id="roster-body">
                {roster.map((s) => (
                  <tr data-name={s.name} data-email={s.email} data-class={String(s.classNo)}>
                    <td class="nowrap">{s.name}</td>
                    <td class="num">{s.classNo}</td>
                    <td class="ltr nowrap">{s.email}</td>
                    <td class="nowrap" data-status>
                      {s.codeGeneratedAt ? <span class="muted">صدر في {formatDateRiyadh(s.codeGeneratedAt)}</span> : <span class="tag tag-missing">بلا رمز</span>}
                    </td>
                    <td style="text-align: end">
                      <a class="btn btn-ghost btn-sm" href={`/admin/report?${new URLSearchParams({ email: s.email, back: "/admin/codes" })}`}>
                        التقرير
                      </a>
                      <button type="button" class="btn btn-secondary btn-sm" data-regenerate={s.codeGeneratedAt ? "1" : "0"}>
                        {s.codeGeneratedAt ? "إعادة توليد" : "توليد"}
                      </button>
                    </td>
                  </tr>
                ))}
                <tr id="roster-empty" hidden>
                  <td colspan={5} class="muted" style="text-align: center; padding: var(--space-6)">
                    لا توجد نتائج مطابقة.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
