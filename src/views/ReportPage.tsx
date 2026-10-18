import { Document } from "./Layout";
import { BackIcon, DownloadIcon, PrintIcon } from "./icons";
import { ReportDocument } from "./ReportDocument";
import type { SchoolInfo, StudentReport } from "../shared/types";
import { periodShortLabel, type PeriodKey } from "../shared/periods";

/** Parent view (default), or the teacher's view of any student opened from the dashboard. */
type Mode = { kind: "parent" } | { kind: "teacher"; backHref: string; pdfUrl: string };

type Props = {
  report: StudentReport;
  school: SchoolInfo;
  issuedAt: Date;
  mode?: Mode;
  /** Periods the parent may switch between, latest first. A selector appears only when there is more than one. */
  periods?: PeriodKey[];
};

export function ReportPage({ report, school, issuedAt, mode = { kind: "parent" }, periods = [] }: Props) {
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
                data-pdf-url={mode.kind === "teacher" ? mode.pdfUrl : `/api/report/pdf?period=${report.period}`}
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
          {periods.length > 1 && (
            <nav class="period-tabs no-print" aria-label="الفترة">
              {[...periods].reverse().map((k) => (
                <a href={`/report?period=${k}`} aria-current={k === report.period ? "page" : undefined}>
                  {periodShortLabel(k)}
                </a>
              ))}
            </nav>
          )}
          <ReportDocument report={report} school={school} issuedAt={issuedAt} />
        </div>
      </main>
    </Document>
  );
}
