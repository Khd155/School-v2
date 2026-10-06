"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Alert } from "../Alert";
import { UploadIcon } from "../icons";
import { useAdminApi } from "./AdminContext";
import { ConfirmDialog } from "./ConfirmDialog";
import { formatNumber, formatScore } from "@/lib/format";
import type { ImportIssue, ImportResult } from "@/lib/import/parse";

type Preview = ImportResult & { draftId: string; filename: string };

const ISSUE_PREVIEW_LIMIT = 30;

export function DataImport({ enabledClassesLabel, currentCount }: { enabledClassesLabel: string; currentCount: number | null }) {
  const api = useAdminApi();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setError(null);
    setSuccess(null);
    if (f && !/\.xlsx$/i.test(f.name)) {
      setFile(null);
      setError("اختر ملفًا بصيغة ‎.xlsx‎.");
      return;
    }
    if (f && f.size > 4 * 1024 * 1024) {
      setFile(null);
      setError("حجم الملف يتجاوز 4 ميجابايت.");
      return;
    }
    setFile(f);
  }

  async function upload() {
    if (!file) return;
    setUploading(true);
    setError(null);
    setSuccess(null);
    if (preview) void api("/api/admin/import/discard", { draftId: preview.draftId });
    setPreview(null);
    const form = new FormData();
    form.append("file", file);
    const res = await api<Preview>("/api/admin/import", form);
    setUploading(false);
    if (!res.ok) return setError(res.message ?? "تعذّرت معالجة الملف.");
    setPreview(res.data);
  }

  async function commit() {
    if (!preview) return;
    setCommitting(true);
    const res = await api("/api/admin/import/commit", { draftId: preview.draftId });
    setCommitting(false);
    setConfirming(false);
    if (!res.ok) return setError(res.message ?? "فشل الاعتماد، وبقيت البيانات السابقة كما هي.");
    setSuccess(`اعتُمدت بيانات ${preview.students.length} طالبًا وأصبحت منشورة لأولياء الأمور.`);
    setPreview(null);
    setFile(null);
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  }

  async function cancel() {
    if (preview) await api("/api/admin/import/discard", { draftId: preview.draftId });
    setPreview(null);
    setFile(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  const errors = preview?.issues.filter((i) => i.level === "error") ?? [];
  const warnings = preview?.issues.filter((i) => i.level === "warning") ?? [];

  return (
    <section className="panel admin-section" aria-labelledby="import-title">
      <div className="admin-section-head">
        <div>
          <h2 id="import-title">تحديث البيانات</h2>
          <p>ملف ‎.xlsx‎ بحد أقصى 4 ميجابايت. الفصول المفعّلة حاليًا: {enabledClassesLabel}.</p>
        </div>
      </div>

      <div className="upload-row">
        <label className="file-picker">
          <input ref={inputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={onPick} disabled={uploading || committing} />
          <span className="btn btn-secondary btn-sm" aria-hidden="true">
            اختيار ملف
          </span>
          <span className={`file-name${file ? " has-file" : ""}`}>{file ? file.name : "لم يُختر ملف"}</span>
        </label>
        <button type="button" className="btn btn-primary" onClick={upload} disabled={!file || uploading || committing}>
          {uploading ? <span className="spinner" aria-hidden="true" /> : <UploadIcon />}
          {uploading ? "جارٍ الفحص…" : "رفع ومعاينة"}
        </button>
      </div>

      <div aria-live="polite">
        {error && (
          <div style={{ marginTop: "var(--space-4)" }}>
            <Alert tone="error">{error}</Alert>
          </div>
        )}
        {success && (
          <div style={{ marginTop: "var(--space-4)" }}>
            <Alert tone="success">{success}</Alert>
          </div>
        )}
      </div>

      {preview && (
        <div className="stack" style={{ marginTop: "var(--space-6)" }}>
          <hr className="divider" style={{ margin: 0 }} />
          <div className="admin-section-head" style={{ marginBottom: 0 }}>
            <div>
              <h3>معاينة الملف</h3>
              <p className="hint ltr" style={{ textAlign: "start" }}>
                {preview.filename}
              </p>
              <p className="hint">
                الورقة «{preview.sheetName}»، صف العناوين {preview.headerRow}.
              </p>
            </div>
          </div>

          <dl className="figures">
            <div className="figure">
              <dt>عدد الطلاب</dt>
              <dd className="num">{preview.students.length}</dd>
            </div>
            {Object.entries(preview.classCounts)
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([cls, count]) => (
                <div className="figure" key={cls}>
                  <dt>الفصل {cls}</dt>
                  <dd className="num">{count}</dd>
                </div>
              ))}
            <div className="figure">
              <dt>أخطاء</dt>
              <dd className="num" style={errors.length ? { color: "var(--danger-text)" } : undefined}>
                {errors.length}
              </dd>
            </div>
            <div className="figure">
              <dt>تنبيهات</dt>
              <dd className="num" style={warnings.length ? { color: "var(--warning-text)" } : undefined}>
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

          {preview.stats.length > 0 && (
            <div>
              <h4 className="issues-head" style={{ marginBottom: "var(--space-2)" }}>
                إحصاءات الفصول بعد الاعتماد
              </h4>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>الفصل</th>
                      <th className="num">الطلاب</th>
                      <th className="num">المتوسط</th>
                      <th className="num">الأعلى</th>
                      <th className="num">دخلوا في الحساب</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.stats.map((s) => (
                      <tr key={s.classNo}>
                        <td>الفصل {s.classNo}</td>
                        <td className="num">{s.total}</td>
                        <td className="num">{s.average !== null ? formatNumber(s.average) : "—"}</td>
                        <td className="num">{s.highest !== null ? formatNumber(s.highest) : "—"}</td>
                        <td className="num">{s.counted}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {preview.students.length > 0 && (
            <div>
              <h4 className="issues-head" style={{ marginBottom: "var(--space-2)" }}>
                الطلاب ({preview.students.length})
              </h4>
              <div className="table-wrap table-scroll">
                <table className="table">
                  <thead>
                    <tr>
                      <th className="num">الصف في الملف</th>
                      <th>الطالب</th>
                      <th>البريد</th>
                      <th className="num">الفصل</th>
                      <th className="num">أعمال الفصل</th>
                      <th className="num">القرآن والاختبارات</th>
                      <th className="num">النهائي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.students.map((s) => (
                      <tr key={s.row}>
                        <td className="num muted">{s.row}</td>
                        <td className="nowrap">{s.name || <span className="muted">—</span>}</td>
                        <td className="ltr nowrap">{s.email || <span className="muted">—</span>}</td>
                        <td className="num">{s.classNo || "—"}</td>
                        <td className="num">{formatScore(s.scores.classworkTotal)}</td>
                        <td className="num">{formatScore(s.scores.quranExamsTotal)}</td>
                        <td className="num">{formatScore(s.scores.finalTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="actions">
            <button type="button" className="btn btn-primary" disabled={errors.length > 0 || committing} onClick={() => setConfirming(true)}>
              اعتماد البيانات
            </button>
            <button type="button" className="btn btn-secondary" onClick={cancel} disabled={committing}>
              إلغاء المعاينة
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        title="اعتماد البيانات الجديدة؟"
        confirmLabel="اعتماد ونشر"
        pending={committing}
        onConfirm={commit}
        onCancel={() => setConfirming(false)}
      >
        <p>
          {currentCount !== null
            ? `ستحل بيانات ${preview?.students.length ?? 0} طالبًا محل البيانات المنشورة حاليًا (${currentCount} طالبًا).`
            : `ستُنشر بيانات ${preview?.students.length ?? 0} طالبًا لأولياء الأمور.`}{" "}
          يُحفظ الإصدار الحالي ويمكن استرجاعه لاحقًا.
        </p>
      </ConfirmDialog>
    </section>
  );
}

function IssueList({ title, issues, tone }: { title: string; issues: ImportIssue[]; tone: "error" | "warning" }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? issues : issues.slice(0, ISSUE_PREVIEW_LIMIT);
  return (
    <div className="issues">
      <div className="issues-head">
        <span>
          {title} ({issues.length})
        </span>
        {issues.length > ISSUE_PREVIEW_LIMIT && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "عرض أقل" : `عرض الكل (${issues.length})`}
          </button>
        )}
      </div>
      <ul className={`issue-list is-${tone}`}>
        {shown.map((issue, i) => (
          <li key={i}>
            <span className="issue-row">{issue.row ? `الصف ${issue.row}` : "الملف"}</span>
            <span>{issue.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
