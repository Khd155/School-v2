import { PageHead } from "./AdminLayout";
import { formatScore } from "../../shared/format";
import type { StudentListEntry } from "../../server/students";

type Props = { students: StudentListEntry[]; q: string; classNo: number | null };

/**
 * Searchable list of all students. Filtering is instant in the browser (admin.ts);
 * the same form also works without JavaScript via the query string.
 */
export function StudentsContent({ students, q, classNo }: Props) {
  const classes = [...new Set(students.map((s) => s.classNo))].sort((a, b) => a - b);
  const query = q.trim().toLowerCase();
  const visible = (s: StudentListEntry) => (classNo === null || s.classNo === classNo) && (!query || s.name.toLowerCase().includes(query) || s.email.includes(query));
  const shown = students.filter(visible).length;

  return (
    <>
      <PageHead title="الطلاب">ابحث باسم الطالب أو بريده لفتح تقريره وطباعته.</PageHead>
      <section class="panel admin-section" aria-labelledby="students-title" id="students-root">
        <h2 id="students-title" class="visually-hidden">
          قائمة الطلاب
        </h2>
        {students.length === 0 ? (
          <p class="hint">اعتمد بيانات الطلاب أولًا من صفحة «بيانات الطلاب».</p>
        ) : (
          <>
            <form class="filters" method="get" action="/admin/students" role="search">
              <label class="visually-hidden" for="students-q">
                بحث
              </label>
              <input id="students-q" name="q" class="input" placeholder="ابحث باسم الطالب أو بريده" value={q} maxlength={100} autocomplete="off" autofocus />
              <label class="visually-hidden" for="students-class">
                الفصل
              </label>
              <select id="students-class" name="class" class="select input">
                <option value="">كل الفصول</option>
                {classes.map((c) => (
                  <option value={String(c)} selected={c === classNo}>
                    الفصل {c}
                  </option>
                ))}
              </select>
              <noscript>
                <button type="submit" class="btn btn-secondary">
                  بحث
                </button>
              </noscript>
            </form>
            <p class="hint" id="students-count" aria-live="polite" style="margin-bottom: var(--space-3)">
              {shown} من {students.length} طالبًا
            </p>
            <div class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>الطالب</th>
                    <th class="num">الفصل</th>
                    <th>البريد</th>
                    <th class="num">المجموع النهائي</th>
                    <th>
                      <span class="visually-hidden">التقرير</span>
                    </th>
                  </tr>
                </thead>
                <tbody id="students-body">
                  {students.map((s) => (
                    <tr data-name={s.name.toLowerCase()} data-email={s.email} data-class={String(s.classNo)} hidden={!visible(s)}>
                      <td class="nowrap">{s.name}</td>
                      <td class="num">{s.classNo}</td>
                      <td class="ltr nowrap">{s.email}</td>
                      <td class="num">{formatScore(s.finalTotal)}</td>
                      <td style="text-align: end">
                        <a class="btn btn-secondary btn-sm" href={`/admin/report?${new URLSearchParams({ email: s.email, back: "/admin/students" })}`}>
                          التقرير
                        </a>
                      </td>
                    </tr>
                  ))}
                  <tr id="students-empty" hidden={shown > 0}>
                    <td colspan={5} class="muted" style="text-align: center; padding: var(--space-6)">
                      لا يوجد طالب مطابق.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </>
  );
}
