import { Alert } from "../Alert";
import { UploadIcon } from "../icons";
import { PageHead } from "./AdminLayout";
import { formatClassList, formatDateTimeRiyadh, formatNumber, formatScore } from "../../shared/format";
import type { ImportIssue, ImportResult } from "../../shared/import/parse";
import type { ClassStats } from "../../shared/types";
import type { DatasetVersion } from "../../server/students";

type Props = {
  dataUpdatedAt: string | null;
  stats: ClassStats[];
  versions: DatasetVersion[];
  enabledClasses: number[];
  keptVersions: number;
  flash: string | null;
};

const FLASH: Record<string, string> = {
  committed: "اعتُمدت البيانات الجديدة وأصبحت منشورة لأولياء الأمور.",
  restored: "استُرجعت النسخة المختارة وأصبحت منشورة.",
};

export function DataContent({ dataUpdatedAt, stats, versions, enabledClasses, keptVersions, flash }: Props) {
  const active = versions.find((v) => v.active);
  return (
    <>
      <PageHead title="بيانات الطلاب">
        ارفع ملف «الملخص العام.xlsx»، وراجع المعاينة، ثم اعتمده. لا تتغير البيانات المعروضة لأولياء الأمور إلا بعد الاعتماد.
      </PageHead>

      {flash && FLASH[flash] && (
        <div style="margin-bottom: var(--space-5)">
          <Alert tone="success">{FLASH[flash]}</Alert>
        </div>
      )}

      <section class="panel admin-section" aria-labelledby="live-title">
        <div class="admin-section-head">
          <div>
            <h2 id="live-title">البيانات المنشورة</h2>
            <p>ما يراه أولياء الأمور الآن.</p>
          </div>
        </div>
        {active ? (
          <div class="stack">
            <dl class="figures">
              <div class="figure">
                <dt>آخر تحديث للبيانات</dt>
                <dd class="text">{dataUpdatedAt ? formatDateTimeRiyadh(dataUpdatedAt) : "—"}</dd>
              </div>
              <div class="figure">
                <dt>عدد الطلاب</dt>
                <dd class="num">{active.studentCount}</dd>
              </div>
              <div class="figure">
                <dt>الملف</dt>
                <dd class="text ltr">{active.filename}</dd>
              </div>
            </dl>
            <StatsTable stats={stats} />
          </div>
        ) : (
          <p class="hint">لم تُعتمد بيانات بعد. صفحة الاستعلام تعرض لأولياء الأمور أن النتائج لم تُنشر.</p>
        )}
      </section>

      <section class="panel admin-section" aria-labelledby="import-title">
        <div class="admin-section-head">
          <div>
            <h2 id="import-title">تحديث البيانات</h2>
            <p>ملف ‎.xlsx‎ بحد أقصى 4 ميجابايت. الفصول المفعّلة حاليًا: {formatClassList(enabledClasses)}.</p>
          </div>
        </div>
        <div class="upload-row">
          <label class="file-picker">
            <input type="file" id="import-file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" />
            <span class="btn btn-secondary btn-sm" aria-hidden="true">
              اختيار ملف
            </span>
            <span class="file-name" id="import-file-name">
              لم يُختر ملف
            </span>
          </label>
          <button type="button" class="btn btn-primary" id="import-upload" disabled data-current-count={active ? String(active.studentCount) : ""}>
            <span class="spinner" aria-hidden="true" hidden></span>
            <span class="btn-icon">
              <UploadIcon />
            </span>
            <span class="btn-label">رفع ومعاينة</span>
          </button>
        </div>
        <div id="import-message" aria-live="polite"></div>
        <div id="import-preview"></div>
      </section>

      <section class="panel admin-section" aria-labelledby="versions-title">
        <div class="admin-section-head">
          <div>
            <h2 id="versions-title">النسخ السابقة</h2>
            <p>يُحتفظ بآخر {keptVersions} نسخ معتمدة. الاسترجاع يجعل النسخة المختارة هي المنشورة، ويحدّث «آخر تحديث للبيانات».</p>
          </div>
        </div>
        <div id="versions-message" aria-live="polite"></div>
        {versions.length === 0 ? (
          <p class="hint">لا توجد نسخ بعد.</p>
        ) : (
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>تاريخ الاعتماد</th>
                  <th>الملف</th>
                  <th class="num">الطلاب</th>
                  <th class="num">تنبيهات</th>
                  <th>
                    <span class="visually-hidden">الإجراء</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {versions.map((v) => (
                  <tr>
                    <td class="nowrap">{formatDateTimeRiyadh(v.committedAt)}</td>
                    <td class="ltr">{v.filename}</td>
                    <td class="num">{v.studentCount}</td>
                    <td class="num">{v.warningCount}</td>
                    <td class="nowrap" style="text-align: end">
                      {v.active ? (
                        <span class="tag tag-current">المنشورة حاليًا</span>
                      ) : (
                        <button
                          type="button"
                          class="btn btn-secondary btn-sm"
                          data-restore={String(v.id)}
                          data-label={`${formatDateTimeRiyadh(v.committedAt)} (${v.studentCount} طالبًا)`}
                        >
                          استرجاع
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function StatsTable({ stats }: { stats: ClassStats[] }) {
  return (
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>الفصل</th>
            <th class="num">عدد الطلاب</th>
            <th class="num">متوسط المجموع النهائي</th>
            <th class="num">أعلى مجموع نهائي</th>
            <th class="num">دخلوا في الحساب</th>
          </tr>
        </thead>
        <tbody>
          {stats.map((s) => (
            <tr>
              <td>الفصل {s.classNo}</td>
              <td class="num">{s.total}</td>
              <td class="num">{s.average !== null ? formatNumber(s.average) : "—"}</td>
              <td class="num">{s.highest !== null ? formatNumber(s.highest) : "—"}</td>
              <td class="num">{s.counted}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const ISSUE_PREVIEW_LIMIT = 30;

/** Server-rendered preview returned to the upload request and inserted by the client. */
export function ImportPreview({ result, filename, draftId }: { result: ImportResult; filename: string; draftId: string }) {
  const errors = result.issues.filter((i) => i.level === "error");
  const warnings = result.issues.filter((i) => i.level === "warning");
  return (
    <div class="stack" style="margin-top: var(--space-6)" data-draft-id={draftId} data-student-count={String(result.students.length)}>
      <hr class="divider" style="margin: 0" />
      <div>
        <h3>معاينة الملف</h3>
        <p class="hint ltr" style="text-align: right">
          {filename}
        </p>
        <p class="hint">
          الورقة «{result.sheetName}»، صف العناوين {result.headerRow}.
        </p>
      </div>

      <dl class="figures">
        <div class="figure">
          <dt>عدد الطلاب</dt>
          <dd class="num">{result.students.length}</dd>
        </div>
        {Object.entries(result.classCounts)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([cls, count]) => (
            <div class="figure">
              <dt>الفصل {cls}</dt>
              <dd class="num">{count}</dd>
            </div>
          ))}
        <div class="figure">
          <dt>أخطاء</dt>
          <dd class="num" style={errors.length ? "color: var(--danger-text)" : undefined}>
            {errors.length}
          </dd>
        </div>
        <div class="figure">
          <dt>تنبيهات</dt>
          <dd class="num" style={warnings.length ? "color: var(--warning-text)" : undefined}>
            {warnings.length}
          </dd>
        </div>
      </dl>

      {errors.length > 0 ? (
        <Alert tone="error" title="لا يمكن اعتماد الملف">
          أصلح الأخطاء أدناه في ملف Excel ثم ارفعه مرة أخرى. البيانات المنشورة لم تتغير.
        </Alert>
      ) : warnings.length > 0 ? (
        <Alert tone="warning" title="الملف صالح للاعتماد مع تنبيهات">
          راجع التنبيهات. القيم تُعتمد كما هي في الملف دون أي تعديل تلقائي.
        </Alert>
      ) : (
        <Alert tone="success" title="الملف سليم">
          لم تُكتشف أخطاء أو اختلافات في المجاميع.
        </Alert>
      )}

      {errors.length > 0 && <IssueList title="الأخطاء" issues={errors} tone="error" />}
      {warnings.length > 0 && <IssueList title="التنبيهات" issues={warnings} tone="warning" />}

      {result.stats.length > 0 && (
        <div>
          <h4 class="issues-head" style="margin-bottom: var(--space-2)">
            إحصاءات الفصول بعد الاعتماد
          </h4>
          <StatsTable stats={result.stats} />
        </div>
      )}

      {result.students.length > 0 && (
        <div>
          <h4 class="issues-head" style="margin-bottom: var(--space-2)">
            الطلاب ({result.students.length})
          </h4>
          <div class="table-wrap table-scroll">
            <table class="table">
              <thead>
                <tr>
                  <th class="num">الصف في الملف</th>
                  <th>الطالب</th>
                  <th>البريد</th>
                  <th class="num">الفصل</th>
                  <th class="num">أعمال الفصل</th>
                  <th class="num">القرآن والاختبارات</th>
                  <th class="num">النهائي</th>
                </tr>
              </thead>
              <tbody>
                {result.students.map((s) => (
                  <tr>
                    <td class="num muted">{s.row}</td>
                    <td class="nowrap">{s.name || <span class="muted">—</span>}</td>
                    <td class="ltr nowrap">{s.email || <span class="muted">—</span>}</td>
                    <td class="num">{s.classNo || "—"}</td>
                    <td class="num">{formatScore(s.scores.classworkTotal)}</td>
                    <td class="num">{formatScore(s.scores.quranExamsTotal)}</td>
                    <td class="num">{formatScore(s.scores.finalTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div class="actions">
        <button type="button" class="btn btn-primary" id="import-commit" disabled={errors.length > 0 || result.students.length === 0}>
          اعتماد البيانات
        </button>
        <button type="button" class="btn btn-secondary" id="import-cancel">
          إلغاء المعاينة
        </button>
      </div>
    </div>
  );
}

function IssueList({ title, issues, tone }: { title: string; issues: ImportIssue[]; tone: "error" | "warning" }) {
  const extra = issues.length > ISSUE_PREVIEW_LIMIT;
  return (
    <div class="issues">
      <div class="issues-head">
        <span>
          {title} ({issues.length})
        </span>
        {extra && (
          <button type="button" class="btn btn-ghost btn-sm" data-toggle-issues aria-expanded="false">
            عرض الكل ({issues.length})
          </button>
        )}
      </div>
      <ul class={`issue-list is-${tone}`}>
        {issues.map((issue, i) => (
          <li hidden={i >= ISSUE_PREVIEW_LIMIT} data-extra={i >= ISSUE_PREVIEW_LIMIT ? "" : undefined}>
            <span class="issue-row">{issue.row ? `الصف ${issue.row}` : "الملف"}</span>
            <span>{issue.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
