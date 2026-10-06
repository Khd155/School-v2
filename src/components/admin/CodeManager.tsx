"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Alert } from "../Alert";
import { DownloadIcon, PrintIcon } from "../icons";
import { useAdminApi } from "./AdminContext";
import { ConfirmDialog } from "./ConfirmDialog";
import { formatAccessCode } from "@/lib/access-code-format";
import { formatDateRiyadh } from "@/lib/format";
import type { CodeRosterEntry } from "@/lib/server/students";

type IssuedCode = { name: string; email: string; classNo: number; code: string };
type Pending = { mode: "missing" } | { mode: "all" } | { mode: "one"; student: CodeRosterEntry };

type Props = { roster: CodeRosterEntry[]; siteUrl: string; schoolName: string; subject: string; grade: string };

export function CodeManager({ roster, siteUrl, schoolName, subject, grade }: Props) {
  const api = useAdminApi();
  const router = useRouter();
  const [issued, setIssued] = useState<IssuedCode[] | null>(null);
  const [confirm, setConfirm] = useState<Pending | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Codes are shown once; warn before leaving while they are on screen.
  useEffect(() => {
    if (!issued) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [issued]);

  const missing = roster.filter((s) => !s.codeGeneratedAt).length;
  const classes = useMemo(() => [...new Set(roster.map((s) => s.classNo))].sort((a, b) => a - b), [roster]);
  const filtered = roster.filter(
    (s) =>
      (classFilter === "all" || String(s.classNo) === classFilter) &&
      (!query.trim() || s.name.includes(query.trim()) || s.email.includes(query.trim().toLowerCase())),
  );

  async function run(p: Pending) {
    setPending(true);
    setError(null);
    const body = p.mode === "one" ? { mode: "one", email: p.student.email } : { mode: p.mode };
    const res = await api<{ codes: IssuedCode[] }>("/api/admin/codes", body);
    setPending(false);
    setConfirm(null);
    if (!res.ok) return setError(res.message ?? "تعذّر توليد الرموز.");
    setIssued(res.data.codes);
    router.refresh();
  }

  function downloadCsv() {
    if (!issued) return;
    const rows = [["الطالب", "الفصل", "البريد المدرسي", "رمز الوصول", "رابط الاستعلام"], ...issued.map((c) => [c.name, String(c.classNo), c.email, c.code, siteUrl])];
    // ="..." keeps leading zeros when opened in Excel. BOM so Excel reads UTF-8 Arabic.
    const csv = rows
      .map((r, i) => r.map((v, j) => (i > 0 && j === 3 ? `="${v}"` : csvCell(v))).join(","))
      .join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `رموز الوصول - ${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  function printSlips() {
    document.body.classList.add("printing-slips");
    const cleanup = () => {
      document.body.classList.remove("printing-slips");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
  }

  return (
    <>
      <section className="panel admin-section" aria-labelledby="codes-summary">
        <div className="admin-section-head">
          <div>
            <h2 id="codes-summary">توليد الرموز</h2>
            <p>تبقى الرموز صالحة بعد تحديث بيانات الطلاب ما دام البريد لم يتغير.</p>
          </div>
        </div>
        {roster.length === 0 ? (
          <p className="hint">اعتمد بيانات الطلاب أولًا من صفحة «بيانات الطلاب».</p>
        ) : (
          <div className="stack">
            <dl className="figures">
              <div className="figure">
                <dt>الطلاب في البيانات المنشورة</dt>
                <dd className="num">{roster.length}</dd>
              </div>
              <div className="figure">
                <dt>لديهم رمز</dt>
                <dd className="num">{roster.length - missing}</dd>
              </div>
              <div className="figure">
                <dt>بلا رمز</dt>
                <dd className="num" style={missing ? { color: "var(--warning-text)" } : undefined}>
                  {missing}
                </dd>
              </div>
            </dl>
            <div className="actions">
              <button type="button" className="btn btn-primary" disabled={missing === 0 || pending} onClick={() => run({ mode: "missing" })}>
                {pending && confirm === null && <span className="spinner" aria-hidden="true" />}
                توليد رموز للطلاب بلا رمز ({missing})
              </button>
              <button type="button" className="btn btn-danger" disabled={pending} onClick={() => setConfirm({ mode: "all" })}>
                إعادة توليد رموز الجميع
              </button>
            </div>
          </div>
        )}
        <div aria-live="polite">
          {error && (
            <div style={{ marginTop: "var(--space-4)" }}>
              <Alert tone="error">{error}</Alert>
            </div>
          )}
        </div>
      </section>

      {issued && (
        <section className="panel admin-section" aria-labelledby="issued-title">
          <div className="admin-section-head">
            <div>
              <h2 id="issued-title">الرموز الجديدة ({issued.length})</h2>
              <p>لن تظهر هذه الرموز مرة أخرى بعد مغادرة الصفحة. نزّلها أو اطبع بطاقات التوزيع الآن.</p>
            </div>
            <div className="actions">
              <button type="button" className="btn btn-primary" onClick={downloadCsv}>
                <DownloadIcon />
                تنزيل CSV
              </button>
              <button type="button" className="btn btn-secondary" onClick={printSlips}>
                <PrintIcon />
                طباعة بطاقات التوزيع
              </button>
            </div>
          </div>
          <div className="table-wrap table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>الطالب</th>
                  <th className="num">الفصل</th>
                  <th>البريد</th>
                  <th>الرمز</th>
                </tr>
              </thead>
              <tbody>
                {issued.map((c) => (
                  <tr key={c.email}>
                    <td className="nowrap">{c.name}</td>
                    <td className="num">{c.classNo}</td>
                    <td className="ltr nowrap">{c.email}</td>
                    <td className="ltr nowrap">
                      <span className="code-text">{formatAccessCode(c.code)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="actions" style={{ marginTop: "var(--space-4)" }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setIssued(null)}>
              إخفاء الرموز
            </button>
          </div>
        </section>
      )}

      {roster.length > 0 && (
        <section className="panel admin-section" aria-labelledby="roster-title">
          <div className="admin-section-head">
            <div>
              <h2 id="roster-title">الطلاب</h2>
              <p>«إعادة توليد» تُبطل رمز الطالب السابق فورًا.</p>
            </div>
          </div>
          <div className="filters">
            <label className="visually-hidden" htmlFor="roster-search">
              بحث
            </label>
            <input id="roster-search" className="input" placeholder="بحث بالاسم أو البريد" value={query} onChange={(e) => setQuery(e.target.value)} />
            <label className="visually-hidden" htmlFor="roster-class">
              الفصل
            </label>
            <select id="roster-class" className="select input" value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
              <option value="all">كل الفصول</option>
              {classes.map((c) => (
                <option key={c} value={String(c)}>
                  الفصل {c}
                </option>
              ))}
            </select>
          </div>
          <div className="table-wrap table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>الطالب</th>
                  <th className="num">الفصل</th>
                  <th>البريد</th>
                  <th>الرمز</th>
                  <th>
                    <span className="visually-hidden">الإجراء</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.email}>
                    <td className="nowrap">{s.name}</td>
                    <td className="num">{s.classNo}</td>
                    <td className="ltr nowrap">{s.email}</td>
                    <td className="nowrap">
                      {s.codeGeneratedAt ? (
                        <span className="muted">صدر في {formatDateRiyadh(s.codeGeneratedAt)}</span>
                      ) : (
                        <span className="tag tag-missing">بلا رمز</span>
                      )}
                    </td>
                    <td style={{ textAlign: "end" }}>
                      <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => setConfirm({ mode: "one", student: s })}>
                        {s.codeGeneratedAt ? "إعادة توليد" : "توليد"}
                      </button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="muted" style={{ textAlign: "center", padding: "var(--space-6)" }}>
                      لا توجد نتائج مطابقة.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.mode === "all" ? "إعادة توليد رموز جميع الطلاب؟" : "توليد رمز جديد لهذا الطالب؟"}
        confirmLabel={confirm?.mode === "all" ? "إعادة توليد الجميع" : "توليد الرمز"}
        tone={confirm?.mode === "all" ? "danger" : "primary"}
        pending={pending}
        onConfirm={() => confirm && run(confirm)}
        onCancel={() => setConfirm(null)}
      >
        {confirm?.mode === "all" ? (
          <p>ستتوقف جميع الرموز الموزعة سابقًا ({roster.length - missing} رمزًا) عن العمل فورًا، وستحتاج إلى توزيع الرموز الجديدة على جميع أولياء الأمور.</p>
        ) : confirm?.mode === "one" ? (
          <p>
            {confirm.student.codeGeneratedAt ? "سيتوقف الرمز السابق للطالب " : "سيصدر رمز للطالب "}
            <strong>{confirm.student.name}</strong>
            {confirm.student.codeGeneratedAt ? " عن العمل فورًا." : "."}
          </p>
        ) : null}
      </ConfirmDialog>

      {mounted &&
        issued &&
        createPortal(
          <div className="slips-root" aria-hidden="true">
            <div className="slips">
              {issued.map((c) => (
                <div className="slip" key={c.email}>
                  <p className="slip-school">{schoolName}</p>
                  <p className="slip-meta">
                    استعلام التحصيل — {subject} — الصف {grade}
                  </p>
                  <p className="slip-name">
                    {c.name} — الفصل {c.classNo}
                  </p>
                  <dl>
                    <dt>البريد</dt>
                    <dd className="ltr">{c.email}</dd>
                    <dt>رمز الوصول</dt>
                    <dd className="ltr">
                      <span className="code-text">{formatAccessCode(c.code)}</span>
                    </dd>
                    <dt>الرابط</dt>
                    <dd className="ltr">{siteUrl}</dd>
                  </dl>
                  <p className="slip-help">افتح الرابط وأدخل البريد والرمز. احتفظ بالرمز ولا تشاركه.</p>
                </div>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

/** Quotes a CSV cell and neutralises spreadsheet formula injection. */
function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}
