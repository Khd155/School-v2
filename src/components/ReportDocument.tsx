import { Masthead } from "./Masthead";
import { formatDateTimeRiyadh, formatNumber, formatScore, isRecorded, NOT_RECORDED } from "@/lib/format";
import {
  HADITH_KEYS,
  QURAN_SEGMENTS,
  type Recitation,
  type SchoolInfo,
  type ScoreValue,
  type StudentReport,
} from "@/lib/types";

type Props = {
  report: StudentReport;
  school: SchoolInfo;
  issuedAt: Date;
};

/**
 * The student report. Rendered as-is on screen, by the browser's print
 * dialog, and server-side into the PDF, so all three stay identical.
 */
export function ReportDocument({ report, school, issuedAt }: Props) {
  const { student, stats, dataUpdatedAt } = report;
  const s = student.scores;
  const termLine = [school.academicYear && `العام الدراسي ${school.academicYear}`, school.term]
    .filter(Boolean)
    .join(" · ");

  return (
    <article className="report" aria-labelledby="report-title">
      <Masthead school={school} />

      <div className="report-heading">
        <h1 id="report-title">تقرير التحصيل الدراسي</h1>
        <p className="report-subject">مادة {school.subject}</p>
        {termLine && <p className="report-term">{termLine}</p>}
      </div>

      <dl className={`report-facts${school.teacherName ? " has-teacher" : ""}`}>
        <div className="fact fact-wide">
          <dt>اسم الطالب</dt>
          <dd>{student.name}</dd>
        </div>
        <div className="fact">
          <dt>الصف</dt>
          <dd>{school.grade}</dd>
        </div>
        <div className="fact">
          <dt>الفصل</dt>
          <dd className="num">{student.classNo}</dd>
        </div>
        {school.teacherName && (
          <div className="fact fact-wide">
            <dt>معلم المادة</dt>
            <dd>{school.teacherName}</dd>
          </div>
        )}
      </dl>

      <section className="report-summary" aria-label="المجموع النهائي ومقارنته بالفصل">
        <div className="summary-final">
          <span className="summary-label">المجموع النهائي</span>
          <span className={`summary-value num${isRecorded(s.finalTotal) ? "" : " is-empty"}`}>
            {formatScore(s.finalTotal)}
          </span>
        </div>
        <dl className="summary-stats">
          <div>
            <dt>متوسط الفصل {student.classNo}</dt>
            <dd className="num">{stats?.average != null ? formatNumber(stats.average) : NOT_RECORDED}</dd>
          </div>
          <div>
            <dt>أعلى مجموع في الفصل</dt>
            <dd className="num">{stats?.highest != null ? formatNumber(stats.highest) : NOT_RECORDED}</dd>
          </div>
        </dl>
      </section>

      <section className="report-section" aria-labelledby="grades-title">
        <h2 id="grades-title" className="section-title">تفاصيل الدرجات</h2>
        <div className="grades">
          <div className="grade-row grade-row-3">
            <GradeCell label="الواجبات" value={s.homework} />
            <GradeCell label="المشاركة والتفاعل" value={s.participation} />
            <GradeCell label="المهام الأدائية" value={s.performance} />
          </div>
          <div className="grade-row grade-row-total">
            <GradeCell label="مجموع أعمال الفصل" value={s.classworkTotal} total />
          </div>
          <div className="grade-row grade-row-2">
            <GradeCell label="القرآن الكريم" value={s.quran} />
            <GradeCell label="الاختبارات" value={s.exams} />
          </div>
          <div className="grade-row grade-row-total">
            <GradeCell label="مجموع القرآن والاختبارات" value={s.quranExamsTotal} total />
          </div>
        </div>
      </section>

      <section className="report-section" aria-labelledby="quran-title">
        <h2 id="quran-title" className="section-title">تسميع سورة القلم</h2>
        <ul className="recitations recitations-4">
          {QURAN_SEGMENTS.map((seg) => (
            <RecitationCell
              key={seg.key}
              label={`الآيات من ${seg.from} إلى ${seg.to}`}
              value={student.quran[seg.key]}
            />
          ))}
        </ul>
      </section>

      <section className="report-section" aria-labelledby="hadith-title">
        <h2 id="hadith-title" className="section-title">تسميع الأحاديث — المهام الأدائية</h2>
        <ul className="recitations recitations-2">
          {HADITH_KEYS.map((key, i) => (
            <RecitationCell key={key} label={i === 0 ? "الحديث الأول" : "الحديث الثاني"} value={student.hadith[key]} />
          ))}
        </ul>
        <p className="recitation-score">
          درجة المهام الأدائية المسجلة: <strong className="num">{formatScore(s.performance)}</strong>
        </p>
      </section>

      <section className="report-section" aria-labelledby="note-title">
        <h2 id="note-title" className="section-title">الملاحظات</h2>
        <p className={`report-note${student.note ? "" : " is-empty"}`}>{student.note || "لا توجد ملاحظات."}</p>
      </section>

      <footer className="report-footer">
        <dl>
          <div>
            <dt>آخر تحديث للبيانات</dt>
            <dd>{dataUpdatedAt ? formatDateTimeRiyadh(dataUpdatedAt) : NOT_RECORDED}</dd>
          </div>
          <div>
            <dt>تاريخ إصدار التقرير</dt>
            <dd>{formatDateTimeRiyadh(issuedAt)}</dd>
          </div>
        </dl>
        <p className="report-tz">الأوقات بتوقيت المملكة العربية السعودية.</p>
        {school.footerText && <p className="report-footer-text">{school.footerText}</p>}
      </footer>
    </article>
  );
}

function GradeCell({ label, value, total }: { label: string; value: ScoreValue; total?: boolean }) {
  const recorded = isRecorded(value);
  return (
    <div className={`grade-cell${total ? " is-total" : ""}`}>
      <span className="grade-label">{label}</span>
      <span className={`grade-value num${recorded ? "" : " is-empty"}`}>{formatScore(value)}</span>
    </div>
  );
}

const STATUS_TEXT: Record<Recitation["status"], string> = {
  done: "تم",
  not_done: "لم يتم",
  empty: NOT_RECORDED,
  unknown: NOT_RECORDED,
};

function RecitationCell({ label, value }: { label: string; value: Recitation }) {
  const text = value.status === "unknown" && value.raw ? value.raw : STATUS_TEXT[value.status];
  const tone = value.status === "done" ? "done" : value.status === "not_done" ? "not-done" : "empty";
  return (
    <li className={`recitation is-${tone}`}>
      <span className="recitation-label">{label}</span>
      <span className="recitation-status">
        <StatusMark tone={tone} />
        {text}
      </span>
    </li>
  );
}

/** Shape cue alongside colour so status never depends on colour alone. */
function StatusMark({ tone }: { tone: "done" | "not-done" | "empty" }) {
  const common = { width: 16, height: 16, viewBox: "0 0 16 16", "aria-hidden": true, fill: "none" } as const;
  if (tone === "done")
    return (
      <svg {...common}>
        <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (tone === "not-done")
    return (
      <svg {...common}>
        <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  return (
    <svg {...common}>
      <path d="M4.5 8h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
