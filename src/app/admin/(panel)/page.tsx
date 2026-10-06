import { DataImport } from "@/components/admin/DataImport";
import { VersionList } from "@/components/admin/VersionList";
import { formatClassList, formatDateTimeRiyadh, formatNumber } from "@/lib/format";
import { getSchoolSettings } from "@/lib/server/school";
import { getActiveClassStats, getDataState, KEPT_VERSIONS, listVersions } from "@/lib/server/students";

export default async function DataPage() {
  const [state, stats, versions, settings] = await Promise.all([
    getDataState(),
    getActiveClassStats(),
    listVersions(),
    getSchoolSettings(),
  ]);
  const active = versions.find((v) => v.active);

  return (
    <>
      <div className="admin-page-head">
        <h1>بيانات الطلاب</h1>
        <p>ارفع ملف «الملخص العام.xlsx»، وراجع المعاينة، ثم اعتمده. لا تتغير البيانات المعروضة لأولياء الأمور إلا بعد الاعتماد.</p>
      </div>

      <section className="panel admin-section" aria-labelledby="live-title">
        <div className="admin-section-head">
          <div>
            <h2 id="live-title">البيانات المنشورة</h2>
            <p>ما يراه أولياء الأمور الآن.</p>
          </div>
        </div>
        {active ? (
          <div className="stack">
            <dl className="figures">
              <div className="figure">
                <dt>آخر تحديث للبيانات</dt>
                <dd className="text">{state.dataUpdatedAt ? formatDateTimeRiyadh(state.dataUpdatedAt) : "—"}</dd>
              </div>
              <div className="figure">
                <dt>عدد الطلاب</dt>
                <dd className="num">{active.studentCount}</dd>
              </div>
              <div className="figure">
                <dt>الملف</dt>
                <dd className="text ltr">{active.filename}</dd>
              </div>
            </dl>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>الفصل</th>
                    <th className="num">عدد الطلاب</th>
                    <th className="num">متوسط المجموع النهائي</th>
                    <th className="num">أعلى مجموع نهائي</th>
                    <th className="num">دخلوا في الحساب</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map((s) => (
                    <tr key={s.classNo}>
                      <td>الفصل {s.classNo}</td>
                      <td className="num">{s.total}</td>
                      <td className="num">{s.average !== null ? formatNumber(s.average) : "—"}</td>
                      <td className="num">{s.highest !== null ? formatNumber(s.highest) : "—"}</td>
                      <td className="num">{s.counted}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <p className="hint">لم تُعتمد بيانات بعد. صفحة الاستعلام تعرض لأولياء الأمور أن النتائج لم تُنشر.</p>
        )}
      </section>

      <DataImport enabledClassesLabel={formatClassList(settings.enabledClasses)} currentCount={active?.studentCount ?? null} />

      <section className="panel admin-section" aria-labelledby="versions-title">
        <div className="admin-section-head">
          <div>
            <h2 id="versions-title">النسخ السابقة</h2>
            <p>يُحتفظ بآخر {KEPT_VERSIONS} نسخ معتمدة. الاسترجاع يجعل النسخة المختارة هي المنشورة، ويحدّث «آخر تحديث للبيانات».</p>
          </div>
        </div>
        <VersionList versions={versions} />
      </section>
    </>
  );
}
