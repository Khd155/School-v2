import { ReportDocument } from "@/components/ReportDocument";
import { renderReportPdf } from "@/lib/server/pdf";
import { readReportSession } from "@/lib/server/report-session";
import { jsonError } from "@/lib/server/request";
import { getLogoDataUris, getSchoolSettings } from "@/lib/server/school";
import { getStudentReport } from "@/lib/server/students";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const email = await readReportSession();
  if (!email) return jsonError(401, "unauthorized");

  try {
    const [report, settings, logos] = await Promise.all([getStudentReport(email), getSchoolSettings(), getLogoDataUris()]);
    if (!report) return jsonError(404, "no_result");

    const pdf = await renderReportPdf(
      <ReportDocument report={report} school={{ ...settings, logos }} issuedAt={new Date()} />,
      `تقرير ${report.student.name}`,
    );
    const filename = `تقرير التحصيل - ${report.student.name}.pdf`;

    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="report.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("pdf render failed", err);
    return jsonError(500, "pdf_failed");
  }
}
