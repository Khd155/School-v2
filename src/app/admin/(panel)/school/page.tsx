import { SchoolForm } from "@/components/admin/SchoolForm";
import { formatDateTimeRiyadh } from "@/lib/format";
import { getLogoUrls, getSchoolSettings, getSettingsLog } from "@/lib/server/school";

export default async function SchoolPage() {
  const [settings, logos, log] = await Promise.all([getSchoolSettings(), getLogoUrls(), getSettingsLog()]);
  return (
    <>
      <div className="admin-page-head">
        <h1>معلومات المدرسة</h1>
        <p>
          تظهر هذه البيانات في رأس صفحة الاستعلام وفي التقرير والطباعة وملف PDF. تعديلها لا يغيّر «آخر تحديث للبيانات»، فهو خاص ببيانات الطلاب.
        </p>
      </div>
      <SchoolForm initial={settings} logos={logos} />
      <section className="panel admin-section" aria-labelledby="log-title" style={{ marginTop: "var(--space-5)" }}>
        <div className="admin-section-head">
          <h2 id="log-title">سجل التعديلات</h2>
        </div>
        {log.length === 0 ? (
          <p className="hint">لا توجد تعديلات بعد.</p>
        ) : (
          <ul className="log-list">
            {log.map((entry, i) => (
              <li key={i}>
                <time dateTime={entry.changedAt}>{formatDateTimeRiyadh(entry.changedAt)}</time>
                <span>{entry.summary}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
