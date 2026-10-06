"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "../Alert";
import { useAdminApi } from "./AdminContext";
import { ConfirmDialog } from "./ConfirmDialog";
import { formatDateTimeRiyadh } from "@/lib/format";
import type { DatasetVersion } from "@/lib/server/students";

export function VersionList({ versions }: { versions: DatasetVersion[] }) {
  const api = useAdminApi();
  const router = useRouter();
  const [target, setTarget] = useState<DatasetVersion | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  if (versions.length === 0) return <p className="hint">لا توجد نسخ بعد.</p>;

  async function restore() {
    if (!target) return;
    setPending(true);
    const res = await api("/api/admin/versions/restore", { datasetId: target.id });
    setPending(false);
    setTarget(null);
    if (!res.ok) return setMessage({ tone: "error", text: res.message ?? "تعذّر الاسترجاع." });
    setMessage({ tone: "success", text: `استُرجعت نسخة ${formatDateTimeRiyadh(target.committedAt)} وأصبحت منشورة.` });
    router.refresh();
  }

  return (
    <>
      <div aria-live="polite">
        {message && (
          <div style={{ marginBottom: "var(--space-4)" }}>
            <Alert tone={message.tone}>{message.text}</Alert>
          </div>
        )}
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>تاريخ الاعتماد</th>
              <th>الملف</th>
              <th className="num">الطلاب</th>
              <th className="num">تنبيهات</th>
              <th>
                <span className="visually-hidden">الإجراء</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {versions.map((v) => (
              <tr key={v.id}>
                <td className="nowrap">{formatDateTimeRiyadh(v.committedAt)}</td>
                <td className="ltr" style={{ textAlign: "start" }}>
                  {v.filename}
                </td>
                <td className="num">{v.studentCount}</td>
                <td className="num">{v.warningCount}</td>
                <td className="nowrap" style={{ textAlign: "end" }}>
                  {v.active ? (
                    <span className="tag tag-current">المنشورة حاليًا</span>
                  ) : (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setTarget(v)}>
                      استرجاع
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ConfirmDialog
        open={!!target}
        title="استرجاع هذه النسخة؟"
        confirmLabel="استرجاع ونشر"
        pending={pending}
        onConfirm={restore}
        onCancel={() => setTarget(null)}
      >
        <p>
          ستصبح نسخة {target ? formatDateTimeRiyadh(target.committedAt) : ""} ({target?.studentCount} طالبًا) هي المنشورة لأولياء الأمور. تبقى
          النسخة الحالية محفوظة ويمكن الرجوع إليها.
        </p>
      </ConfirmDialog>
    </>
  );
}
