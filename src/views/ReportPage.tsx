import { Document } from "./Layout";
import { BackIcon, DownloadIcon, PrintIcon } from "./icons";
import { ReportDocument } from "./ReportDocument";
import type { SchoolInfo, StudentReport } from "../shared/types";

/** Parent view (default), or the teacher's view of any student opened from the dashboard. */
type Mode = { kind: "parent" } | { kind: "teacher"; backHref: string; pdfUrl: string };

export function ReportPage({ report, school, issuedAt, mode = { kind: "parent" } }: { report: StudentReport; school: SchoolInfo; issuedAt: Date; mode?: Mode }) {
  return (
    <Document title={mode.kind === "teacher" ? `تقرير ${report.student.name}` : "تقرير التحصيل الدراسي"} scripts={["report"]}>
      <main class="public-main report-page-main" id="main">
        <div class="report-page">
          <div class="report-toolbar no-print">
            {mode.kind === "teacher" ? (
              <a href={mode.backHref} class="btn btn-ghost">
                <BackIcon />
                رجوع إلى لوحة المعلم
              </a>
            ) : (
              <button type="button" class="btn btn-ghost" id="new-lookup">
                <BackIcon />
                استعلام جديد
              </button>
            )}
            <div class="report-actions">
              <button type="button" class="btn btn-secondary" id="print-report">
                <PrintIcon />
                طباعة التقرير
              </button>
              <button
                type="button"
                class="btn btn-primary"
                id="download-pdf"
                data-pdf-url={mode.kind === "teacher" ? mode.pdfUrl : "/api/report/pdf"}
                data-expired-url={mode.kind === "teacher" ? "/admin/login" : "/"}
              >
                <span class="spinner" aria-hidden="true" hidden></span>
                <span class="btn-icon">
                  <DownloadIcon />
                </span>
                <span class="btn-label">تنزيل PDF</span>
              </button>
            </div>
            <div id="report-message" class="report-message" aria-live="polite"></div>
          </div>
          <ReportDocument report={report} school={school} issuedAt={issuedAt} />
        </div>
      </main>
    </Document>
  );
}
