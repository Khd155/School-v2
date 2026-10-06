"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "./Alert";
import { BackIcon, DownloadIcon, PrintIcon } from "./icons";

export function ReportActions() {
  const router = useRouter();
  const [downloading, setDownloading] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function downloadPdf() {
    setDownloading(true);
    setError(null);
    try {
      const res = await fetch("/api/report/pdf", { cache: "no-store" });
      if (res.status === 401) {
        router.replace("/");
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filenameFrom(res.headers.get("Content-Disposition")) ?? "تقرير التحصيل.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setError("تعذّر إنشاء ملف PDF الآن. يمكنك المحاولة مرة أخرى، أو استخدام «طباعة التقرير» ثم اختيار «حفظ بتنسيق PDF».");
    } finally {
      setDownloading(false);
    }
  }

  async function newLookup() {
    setLeaving(true);
    await fetch("/api/report/logout", { method: "POST" }).catch(() => {});
    router.replace("/");
  }

  return (
    <div className="report-toolbar no-print">
      <button type="button" className="btn btn-ghost" onClick={newLookup} disabled={leaving}>
        <BackIcon />
        استعلام جديد
      </button>
      <div className="report-actions">
        <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
          <PrintIcon />
          طباعة التقرير
        </button>
        <button type="button" className="btn btn-primary" onClick={downloadPdf} disabled={downloading} aria-busy={downloading}>
          {downloading ? <span className="spinner" aria-hidden="true" /> : <DownloadIcon />}
          {downloading ? "جارٍ التجهيز…" : "تنزيل PDF"}
        </button>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
    </div>
  );
}

function filenameFrom(header: string | null): string | null {
  const match = header?.match(/filename\*=UTF-8''([^;]+)/i);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}
