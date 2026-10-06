import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ReportActions } from "@/components/ReportActions";
import { ReportDocument } from "@/components/ReportDocument";
import { readReportSession } from "@/lib/server/report-session";
import { getSchoolInfo } from "@/lib/server/school";
import { getStudentReport } from "@/lib/server/students";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "تقرير التحصيل الدراسي" };

export default async function ReportPage() {
  const email = await readReportSession();
  if (!email) redirect("/");

  const [report, school] = await Promise.all([getStudentReport(email), getSchoolInfo()]);
  if (!report) redirect("/");

  return (
    <main className="public-main report-page-main" id="main">
      <div className="report-page">
        <ReportActions />
        <ReportDocument report={report} school={school} issuedAt={new Date()} />
      </div>
    </main>
  );
}
