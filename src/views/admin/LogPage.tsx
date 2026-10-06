import { PageHead } from "./AdminLayout";
import { formatDateTimeRiyadh } from "../../shared/format";
import type { LogFilter, LookupLogEntry, LookupOutcome } from "../../server/lookup-log";

export const OUTCOME_LABELS: Record<LookupOutcome, string> = {
  success: "عُرض التقرير",
  email_not_found: "بريد غير موجود",
  wrong_code: "رمز وصول خاطئ",
  no_result: "لا توجد نتيجة",
  rate_limited: "أُوقف لكثرة المحاولات",
};
const OUTCOME_TONE: Record<LookupOutcome, string> = {
  success: "ok",
  email_not_found: "fail",
  wrong_code: "fail",
  no_result: "warn",
  rate_limited: "warn",
};

type Props = {
  entries: LookupLogEntry[];
  hasMore: boolean;
  filter: LogFilter;
  summary: { day_total: number; day_success: number; day_failed: number; students_viewed: number } | null;
  totalStudents: number;
  keptRows: number;
};

export function LogContent({ entries, hasMore, filter, summary, totalStudents, keptRows }: Props) {
  const nextParams = new URLSearchParams();
  if (filter.q) nextParams.set("q", filter.q);
  if (filter.outcome) nextParams.set("outcome", filter.outcome);
  if (entries.length) nextParams.set("before", String(entries[entries.length - 1].id));
  const filtered = !!(filter.q || filter.outcome || filter.before);

  return (
    <>
      <PageHead title="سجل البحث">
        كل محاولة استعلام من صفحة أولياء الأمور: الوقت، والبريد المُدخل، والطالب، والنتيجة. لا يُحفظ رمز الوصول ولا عنوان الجهاز. يُحتفظ بآخر{" "}
        {keptRows.toLocaleString("en-US")} محاولة.
      </PageHead>

      <section class="panel admin-section" aria-labelledby="log-summary">
        <div class="admin-section-head">
          <h2 id="log-summary">ملخص</h2>
        </div>
        <dl class="figures">
          <div class="figure">
            <dt>محاولات آخر 24 ساعة</dt>
            <dd class="num">{summary?.day_total ?? 0}</dd>
          </div>
          <div class="figure">
            <dt>ناجحة</dt>
            <dd class="num">{summary?.day_success ?? 0}</dd>
          </div>
          <div class="figure">
            <dt>غير ناجحة</dt>
            <dd class="num" style={summary?.day_failed ? "color: var(--danger-text)" : undefined}>
              {summary?.day_failed ?? 0}
            </dd>
          </div>
          <div class="figure">
            <dt>طلاب اطّلع أولياء أمورهم على التقرير</dt>
            <dd class="num">
              {summary?.students_viewed ?? 0}
              {totalStudents > 0 && <span class="figure-of"> من {totalStudents}</span>}
            </dd>
          </div>
        </dl>
      </section>

      <section class="panel admin-section" aria-labelledby="log-title">
        <div class="admin-section-head">
          <h2 id="log-title">المحاولات</h2>
        </div>
        <form class="filters" method="get" action="/admin/log" role="search">
          <label class="visually-hidden" for="log-q">
            بحث
          </label>
          <input id="log-q" name="q" class="input" placeholder="بحث بالبريد أو اسم الطالب" value={filter.q} maxlength={100} autocomplete="off" />
          <label class="visually-hidden" for="log-outcome">
            النتيجة
          </label>
          <select id="log-outcome" name="outcome" class="select input">
            <option value="">كل النتائج</option>
            {(Object.keys(OUTCOME_LABELS) as LookupOutcome[]).map((o) => (
              <option value={o} selected={filter.outcome === o}>
                {OUTCOME_LABELS[o]}
              </option>
            ))}
          </select>
          <button type="submit" class="btn btn-secondary">
            تصفية
          </button>
          {filtered && (
            <a href="/admin/log" class="btn btn-ghost">
              إلغاء التصفية
            </a>
          )}
        </form>

        {entries.length === 0 ? (
          <p class="hint" style="padding: var(--space-4) 0">
            {filtered ? "لا توجد محاولات مطابقة." : "لم تُسجَّل أي محاولة بحث بعد."}
          </p>
        ) : (
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>الوقت</th>
                  <th>البريد المُدخل</th>
                  <th>الطالب</th>
                  <th class="num">الفصل</th>
                  <th>النتيجة</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr>
                    <td class="nowrap">{formatDateTimeRiyadh(e.createdAt)}</td>
                    <td class="ltr nowrap">{e.email}</td>
                    <td class="nowrap">{e.studentName ?? <span class="muted">—</span>}</td>
                    <td class="num">{e.classNo ?? <span class="muted">—</span>}</td>
                    <td class="nowrap">
                      <span class={`outcome outcome-${OUTCOME_TONE[e.outcome]}`}>{OUTCOME_LABELS[e.outcome]}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {hasMore && (
          <div class="actions" style="margin-top: var(--space-4)">
            <a class="btn btn-secondary btn-sm" href={`/admin/log?${nextParams.toString()}`}>
              المحاولات الأقدم
            </a>
          </div>
        )}
      </section>
    </>
  );
}
