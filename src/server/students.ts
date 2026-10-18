import { isoIn, nowIso } from "./env";
import { parseScoreMax } from "./periods";
import type { ImportResult } from "../shared/import/parse";
import type { PeriodKey } from "../shared/periods";
import type { ClassStats, StudentReport } from "../shared/types";

/** Number of approved versions kept per period for restore. Older ones are pruned on commit. */
export const KEPT_VERSIONS = 10;
const DRAFT_TTL_MS = 60 * 60_000;

type StatsRow = { class_no: number; average: number | null; highest: number | null; counted: number; total: number };
const statsFromRow = (r: StatsRow): ClassStats => ({
  classNo: r.class_no,
  average: r.average,
  highest: r.highest,
  counted: r.counted,
  total: r.total,
});

type ReportRow = StatsRow & {
  name: string;
  email: string;
  scores: string;
  quran: string;
  hadith: string;
  note: string | null;
  data_updated_at: string | null;
  period: PeriodKey;
  score_max: string;
};

const REPORT_SELECT = `SELECT s.name, s.email, s.class_no, s.scores, s.quran, s.hadith, s.note,
       cs.average, cs.highest, cs.counted, cs.total, p.data_updated_at, p.key AS period, p.score_max
FROM periods p
JOIN students s ON s.dataset_id = p.active_dataset_id
LEFT JOIN class_stats cs ON cs.dataset_id = s.dataset_id AND cs.class_no = s.class_no`;

function reportFromRow(row: ReportRow): StudentReport {
  return {
    student: {
      name: row.name,
      email: row.email,
      classNo: row.class_no,
      scores: JSON.parse(row.scores),
      quran: JSON.parse(row.quran),
      hadith: JSON.parse(row.hadith),
      note: row.note,
    },
    stats: row.counted === null ? null : statsFromRow(row),
    dataUpdatedAt: row.data_updated_at,
    period: row.period,
    scoreMax: parseScoreMax(row.score_max),
  };
}

/** One student in one period's published data. Never returns other students' data. */
export async function getStudentReport(db: D1Database, email: string, period: PeriodKey): Promise<StudentReport | null> {
  const row = await db.prepare(`${REPORT_SELECT} WHERE p.key = ? AND s.email = ?`).bind(period, email).first<ReportRow>();
  return row ? reportFromRow(row) : null;
}

/** Periods visible to parents in which this student has a report, latest first. */
export async function studentVisiblePeriods(db: D1Database, email: string): Promise<PeriodKey[]> {
  const { results } = await db
    .prepare(
      `SELECT p.key FROM periods p JOIN students s ON s.dataset_id = p.active_dataset_id
       WHERE p.visible = 1 AND s.email = ? ORDER BY p.sort DESC`,
    )
    .bind(email)
    .all<{ key: PeriodKey }>();
  return results.map((r) => r.key);
}

/* ---------------- Import drafts ---------------- */

export type DraftPayload = ImportResult & { filename: string; enabledClasses: number[]; period: PeriodKey };

export async function saveDraft(db: D1Database, payload: DraftPayload): Promise<string> {
  const id = crypto.randomUUID();
  await db.batch([
    db.prepare("DELETE FROM import_drafts WHERE expires_at < ?").bind(nowIso()),
    db.prepare("INSERT INTO import_drafts (id, created_at, expires_at, payload) VALUES (?, ?, ?, ?)").bind(id, nowIso(), isoIn(DRAFT_TTL_MS), JSON.stringify(payload)),
  ]);
  return id;
}

export async function getDraft(db: D1Database, draftId: string): Promise<DraftPayload | null> {
  const row = await db.prepare("SELECT payload FROM import_drafts WHERE id = ? AND expires_at > ?").bind(draftId, nowIso()).first<{ payload: string }>();
  return row ? (JSON.parse(row.payload) as DraftPayload) : null;
}

export async function discardDraft(db: D1Database, draftId: string): Promise<void> {
  await db.prepare("DELETE FROM import_drafts WHERE id = ?").bind(draftId).run();
}

export type CommitResult =
  | { ok: true; dataUpdatedAt: string; studentCount: number; period: PeriodKey }
  | { ok: false; reason: "not_found" | "has_errors" | "classes_changed" };

/**
 * Approves a draft as one atomic D1 batch: new dataset version for the draft's
 * period, students, class stats recomputed in SQL, that period's live pointer
 * switch, draft removal, pruning. If any statement fails the whole batch rolls
 * back and the previous data stays live. datasets.draft_id is UNIQUE, so a
 * double-submit commits once. Other periods are never touched.
 */
export async function commitDraft(db: D1Database, draftId: string, currentEnabledClasses: number[]): Promise<CommitResult> {
  const payload = await getDraft(db, draftId);
  if (!payload) return { ok: false, reason: "not_found" };
  if (payload.issues.some((i) => i.level === "error") || payload.students.length === 0) return { ok: false, reason: "has_errors" };
  const enabled = new Set(currentEnabledClasses);
  if (payload.students.some((s) => !enabled.has(s.classNo))) return { ok: false, reason: "classes_changed" };

  const now = nowIso();
  const period = payload.period ?? "t1p1";
  const dataset = "(SELECT id FROM datasets WHERE draft_id = ?1)";
  const warningCount = payload.issues.filter((i) => i.level === "warning").length;

  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO datasets (draft_id, committed_at, source_filename, sheet_name, student_count, class_counts, warning_count, period)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
        )
        .bind(draftId, now, payload.filename, payload.sheetName, payload.students.length, JSON.stringify(payload.classCounts), warningCount, period),
      db
        .prepare(
          `INSERT INTO students (dataset_id, source_row, name, email, class_no, scores, quran, hadith, final_total, note)
           SELECT ${dataset}, json_extract(value, '$.row'), json_extract(value, '$.name'), json_extract(value, '$.email'),
                  json_extract(value, '$.classNo'), json_extract(value, '$.scores'), json_extract(value, '$.quran'),
                  json_extract(value, '$.hadith'), json_extract(value, '$.scores.finalTotal.num'), json_extract(value, '$.note')
           FROM json_each(?2)`,
        )
        .bind(draftId, JSON.stringify(payload.students)),
      // Zeros count; empty / non-numeric final totals are NULL and AVG/MAX/COUNT skip them.
      db
        .prepare(
          `INSERT INTO class_stats (dataset_id, class_no, average, highest, counted, total)
           SELECT dataset_id, class_no, AVG(final_total), MAX(final_total), COUNT(final_total), COUNT(*)
           FROM students WHERE dataset_id = ${dataset} GROUP BY class_no`,
        )
        .bind(draftId),
      db.prepare(`UPDATE periods SET active_dataset_id = ${dataset}, data_updated_at = ?2 WHERE key = ?3`).bind(draftId, now, period),
      db.prepare("DELETE FROM import_drafts WHERE id = ?").bind(draftId),
      // Keep the latest KEPT_VERSIONS per period, and never a dataset that is live for any period.
      db
        .prepare(
          `DELETE FROM datasets WHERE period = ?1
           AND id NOT IN (SELECT id FROM datasets WHERE period = ?1 ORDER BY committed_at DESC, id DESC LIMIT ?2)
           AND id NOT IN (SELECT active_dataset_id FROM periods WHERE active_dataset_id IS NOT NULL)`,
        )
        .bind(period, KEPT_VERSIONS),
    ]);
  } catch (err) {
    if (String(err).includes("UNIQUE constraint failed: datasets.draft_id")) return { ok: false, reason: "not_found" };
    throw err;
  }
  return { ok: true, dataUpdatedAt: now, studentCount: payload.students.length, period };
}

/* ---------------- Versions ---------------- */

export type DatasetVersion = {
  id: number;
  committedAt: string;
  filename: string;
  studentCount: number;
  warningCount: number;
  active: boolean;
};

export async function listVersions(db: D1Database, period: PeriodKey): Promise<DatasetVersion[]> {
  const { results } = await db
    .prepare(
      `SELECT d.id, d.committed_at, d.source_filename, d.student_count, d.warning_count,
              d.id = (SELECT active_dataset_id FROM periods WHERE key = ?1) AS active
       FROM datasets d WHERE d.period = ?1 ORDER BY d.committed_at DESC, d.id DESC`,
    )
    .bind(period)
    .all<{ id: number; committed_at: string; source_filename: string; student_count: number; warning_count: number; active: number }>();
  return results.map((r) => ({
    id: r.id,
    committedAt: r.committed_at,
    filename: r.source_filename,
    studentCount: r.student_count,
    warningCount: r.warning_count,
    active: r.active === 1,
  }));
}

/**
 * Makes an earlier version of its own period live again. That period's
 * "last data update" moves to now, because that is when its data changed.
 */
export async function restoreVersion(db: D1Database, datasetId: number): Promise<boolean> {
  const res = await db
    .prepare("UPDATE periods SET active_dataset_id = ?1, data_updated_at = ?2 WHERE key = (SELECT period FROM datasets WHERE id = ?1)")
    .bind(datasetId, nowIso())
    .run();
  return res.meta.changes > 0;
}

export async function getActiveClassStats(db: D1Database, period: PeriodKey): Promise<ClassStats[]> {
  const { results } = await db
    .prepare(
      `SELECT cs.class_no, cs.average, cs.highest, cs.counted, cs.total FROM class_stats cs
       JOIN periods p ON p.active_dataset_id = cs.dataset_id WHERE p.key = ? ORDER BY cs.class_no`,
    )
    .bind(period)
    .all<StatsRow>();
  return results.map(statsFromRow);
}

/* ---------------- Students for the codes page ---------------- */

export type CodeRosterEntry = { name: string; email: string; classNo: number; codeGeneratedAt: string | null };

export async function getCodeRoster(db: D1Database, period: PeriodKey): Promise<CodeRosterEntry[]> {
  const { results } = await db
    .prepare(
      `SELECT s.name, s.email, s.class_no, ac.generated_at
       FROM periods p
       JOIN students s ON s.dataset_id = p.active_dataset_id
       LEFT JOIN access_codes ac ON ac.email = s.email
       WHERE p.key = ? ORDER BY s.class_no, s.name`,
    )
    .bind(period)
    .all<{ name: string; email: string; class_no: number; generated_at: string | null }>();
  return results.map((r) => ({ name: r.name, email: r.email, classNo: r.class_no, codeGeneratedAt: r.generated_at }));
}

export type StudentListEntry = { name: string; email: string; classNo: number; finalTotal: ScoreValueLite };
type ScoreValueLite = { num: number | null; raw: string | null };

/** All students in one period's data, for the teacher's search list. */
export async function listStudents(db: D1Database, period: PeriodKey): Promise<StudentListEntry[]> {
  const { results } = await db
    .prepare(
      `SELECT s.name, s.email, s.class_no, json_extract(s.scores, '$.finalTotal') AS final_total
       FROM periods p JOIN students s ON s.dataset_id = p.active_dataset_id
       WHERE p.key = ? ORDER BY s.class_no, s.name`,
    )
    .bind(period)
    .all<{ name: string; email: string; class_no: number; final_total: string }>();
  return results.map((r) => ({ name: r.name, email: r.email, classNo: r.class_no, finalTotal: JSON.parse(r.final_total) }));
}

/** Several students from one period in one query, returned in the requested order. */
export async function getStudentReports(db: D1Database, emails: string[], period: PeriodKey): Promise<StudentReport[]> {
  if (emails.length === 0) return [];
  const { results } = await db
    .prepare(`${REPORT_SELECT} WHERE p.key = ? AND s.email IN (SELECT value FROM json_each(?))`)
    .bind(period, JSON.stringify(emails))
    .all<ReportRow>();
  const byEmail = new Map(results.map((row) => [row.email, reportFromRow(row)]));
  return emails.map((e) => byEmail.get(e)).filter((r): r is StudentReport => !!r);
}
