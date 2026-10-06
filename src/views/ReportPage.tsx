import { Document } from "./Layout";
import { BackIcon, DownloadIcon, PrintIcon } from "./icons";
import { ReportDocument } from "./ReportDocument";
import type { SchoolInfo, StudentReport } from "../shared/types";

export function ReportPage({ report, school, issuedAt }: { report: StudentReport; school: SchoolInfo; issuedAt: Date }) {
  return (
    <Document title="تقرير التحصيل الدراسي" scripts={["report"]}>
      <main class="public-main report-page-main" id="main">
        <div class="report-page">
          <div class="report-toolbar no-print">
            <button type="button" class="btn btn-ghost" id="new-lookup">
              <BackIcon />
              استعلام جديد
            </button>
            <div class="report-actions">
              <button type="button" class="btn btn-secondary" id="print-report">
                <PrintIcon />
                طباعة التقرير
              </button>
              <button type="button" class="btn btn-primary" id="download-pdf">
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
