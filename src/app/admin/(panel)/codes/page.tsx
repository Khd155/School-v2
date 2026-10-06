import { headers } from "next/headers";
import { CodeManager } from "@/components/admin/CodeManager";
import { getSchoolSettings } from "@/lib/server/school";
import { getCodeRoster } from "@/lib/server/students";

export default async function CodesPage() {
  const [roster, settings, h] = await Promise.all([getCodeRoster(), getSchoolSettings(), headers()]);
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const siteUrl = host ? `${proto}://${host}` : "";

  return (
    <>
      <div className="admin-page-head">
        <h1>رموز الوصول</h1>
        <p>
          لكل طالب رمز من 8 أرقام يدخله ولي الأمر مع البريد المدرسي. تُحفظ الرموز مشفّرة ولا يمكن عرضها لاحقًا، لذلك تظهر مرة واحدة فقط عند
          توليدها: نزّلها أو اطبعها فورًا.
        </p>
      </div>
      <CodeManager
        roster={roster}
        siteUrl={siteUrl}
        schoolName={settings.schoolName}
        subject={settings.subject}
        grade={settings.grade}
      />
    </>
  );
}
