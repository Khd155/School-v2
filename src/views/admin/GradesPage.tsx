import { DownloadIcon } from "../icons";
import { PageHead } from "./AdminLayout";
import { formatNumber } from "../../shared/format";
import { SCORE_FIELDS, type GradeQuery, type GradeResult } from "../../server/analysis";

type Props = { query: GradeQuery; result: GradeResult; classes: number[]; hasData: boolean };

export function GradesContent({ query, result, classes, hasData }: Props) {
  const fieldLabel = SCORE_FIELDS.find((f) => f.key === query.field)!.label;
  const params = new URLSearchParams({
    field: query.field,
    class: query.classNo ? String(query.classNo) : "",
    order: query.order,
    limit: query.limit ? String(query.limit) : "all",
    below: query.below !== null ? String(query.below) : "",
  });
  const scope = query.classNo ? `الفصل ${query.classNo}` : "كل الفصول";
  const title = `${query.order === "asc" ? "الأقل" : "الأعلى"} في «${fieldLabel}» — ${scope}${query.below !== null ? ` — أقل من ${formatNumber(query.below)}` : ""}`;

  return (
    <>
      <PageHead title="تحليل الدرجات">ترتيب الطلاب حسب أي درجة لمعرفة الأقل أو الأعلى. القيم الفارغة وغير الرقمية لا تدخل في الترتيب ولا تُحسب صفرًا.</PageHead>

      {!hasData ? (
        <section class="panel admin-section">
          <p class="hint">اعتمد بيانات الطلاب أولًا من صفحة «بيانات الطلاب».</p>
        </section>
      ) : (
        <>
          <section class="panel admin-section" aria-labelledby="grades-filter">
            <h2 id="grades-filter" class="visually-hidden">
              خيارات التحليل
            </h2>
            <form class="grades-form" method="get" action="/admin/grades">
              <div class="field">
                <label class="label" for="g-field">الدرجة</label>
                <select id="g-field" name="field" class="select input">
                  {SCORE_FIELDS.map((f) => (
                    <option value={f.key} selected={f.key === query.field}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
              <div class="field">
                <label class="label" for="g-class">الفصل</label>
                <select id="g-class" name="class" class="select input">
                  <option value="">كل الفصول</option>
                  {classes.map((c) => (
                    <option value={String(c)} selected={c === query.classNo}>
                      الفصل {c}
                    </option>
                  ))}
                </select>
              </div>
              <div class="field">
                <label class="label" for="g-order">الترتيب</label>
                <select id="g-order" name="order" class="select input">
                  <option value="asc" selected={query.order === "asc"}>
                    الأقل أولًا
                  </option>
                  <option value="desc" selected={query.order === "desc"}>
                    الأعلى أولًا
                  </option>
                </select>
              </div>
              <div class="field">
                <label class="label" for="g-limit">العدد</label>
                <select id="g-limit" name="limit" class="select input">
                  {[10, 20, 50].map((n) => (
                    <option value={String(n)} selected={query.limit === n}>
                      {n} طلاب
                    </option>
                  ))}
                  <option value="all" selected={query.limit === null}>
                    الكل
                  </option>
                </select>
              </div>
              <div class="field">
                <label class="label" for="g-below">
                  أقل من <span class="optional">(اختياري)</span>
                </label>
                <input id="g-below" name="below" class="input" inputmode="decimal" placeholder="مثال: 10" value={query.below !== null ? String(query.below) : ""} maxlength={8} />
              </div>
              <div class="grades-form-actions">
                <button type="submit" class="btn btn-primary">
                  عرض
                </button>
              </div>
            </form>
          </section>

          <section class="panel admin-section" aria-labelledby="grades-title">
            <div class="admin-section-head">
              <div>
                <h2 id="grades-title">{title}</h2>
                <p>
                  {result.rows.length} من {result.considered} طالبًا لهم درجة مسجلة
                  {result.notRecorded > 0 && ` · ${result.notRecorded} غير مسجل في هذه الدرجة`}
                </p>
              </div>
              {result.rows.length > 0 && (
                <a class="btn btn-secondary btn-sm" href={`/admin/grades.csv?${params.toString()}`} download>
                  <DownloadIcon />
                  تنزيل CSV
                </a>
              )}
            </div>
            {result.rows.length === 0 ? (
              <p class="hint">لا يوجد طلاب مطابقون لهذه الخيارات.</p>
            ) : (
              <div class="table-wrap">
                <table class="table">
                  <thead>
                    <tr>
                      <th class="num">#</th>
                      <th>الطالب</th>
                      <th class="num">الفصل</th>
                      <th>البريد</th>
                      <th class="num">{fieldLabel}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((r, i) => (
                      <tr>
                        <td class="num muted">{i + 1}</td>
                        <td class="nowrap">{r.name}</td>
                        <td class="num">{r.classNo}</td>
                        <td class="ltr nowrap">{r.email}</td>
                        <td class="num grade-cell-value">{formatNumber(r.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
