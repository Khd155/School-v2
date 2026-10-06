import { Alert } from "@/components/Alert";
import { LookupForm } from "@/components/LookupForm";
import { Masthead } from "@/components/Masthead";
import { formatClassList, formatDateTimeRiyadh } from "@/lib/format";
import { getSchoolInfo } from "@/lib/server/school";
import { getDataState } from "@/lib/server/students";

export const dynamic = "force-dynamic";

export default async function LookupPage() {
  const [school, state] = await Promise.all([getSchoolInfo(), getDataState()]);
  const published = state.activeDatasetId !== null;

  return (
    <main className="public-main" id="main">
      <div className="lookup">
        <Masthead school={school} />

        <section className="panel lookup-panel" aria-labelledby="lookup-title">
          <h1 className="lookup-title" id="lookup-title">
            استعلام التحصيل الدراسي
          </h1>
          <p className="lookup-intro">
            مادة <strong>{school.subject}</strong> لطلاب <strong>الصف {school.grade}</strong>
            {school.enabledClasses.length > 0 && (
              <>
                {" "}
                — {school.enabledClasses.length > 1 ? "الفصول" : "الفصل"} {formatClassList(school.enabledClasses)}
              </>
            )}
            .
          </p>

          {published ? (
            <LookupForm />
          ) : (
            <div className="lookup-empty">
              <Alert tone="info" title="لم تُنشر النتائج بعد">
                سيتاح الاستعلام بعد أن يعتمد معلم المادة بيانات الطلاب. حاول لاحقًا.
              </Alert>
            </div>
          )}
        </section>

        {published && state.dataUpdatedAt && (
          <div className="lookup-meta">
            <p>
              آخر تحديث للبيانات: <strong>{formatDateTimeRiyadh(state.dataUpdatedAt)}</strong>
            </p>
            <p className="lookup-privacy">لا تُعرض نتيجة أي طالب إلا بالبريد المدرسي ورمز الوصول معًا.</p>
          </div>
        )}
      </div>
    </main>
  );
}
