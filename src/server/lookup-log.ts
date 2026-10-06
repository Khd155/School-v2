import { nowIso } from "./env";

export type LookupOutcome = "success" | "email_not_found" | "wrong_code" | "no_result" | "rate_limited";
export const LOOKUP_LOG_KEPT = 5000;

export type LookupLogEntry = {
  id: number;
  createdAt: string;
  email: string;
  outcome: LookupOutcome;
  studentName: string | null;
  classNo: number | null;
};

/** Records one attempt. Callers run it via waitUntil so the parent's response is not delayed. */
export async function recordLookup(
  db: D1Database,
  entry: { email: string; outcome: LookupOutcome; studentName?: string | null; classNo?: number | null },
): Promise<void> {
  const statements = [
    db
      .prepare("INSERT INTO lookup_log (created_at, email, outcome, student_name, class_no) VALUES (?, ?, ?, ?, ?)")
      .bind(nowIso(), entry.email.slice(0, 254), entry.outcome, entry.studentName ?? null, entry.classNo ?? null),
  ];
  // Occasional pruning keeps the table bounded even under a flood of attempts.
  if (Math.random() < 0.05) {
    statements.push(
      db.prepare("DELETE FROM lookup_log WHERE id <= (SELECT id FROM lookup_log ORDER BY id DESC LIMIT 1 OFFSET ?)").bind(LOOKUP_LOG_KEPT),
    );
  }
  await db.batch(statements);
}

/** Student name/class in the live data, used to label failed attempts for the teacher. */
export async function findStudentLabel(db: D1Database, email: string) {
  return db
    .prepare(
      `SELECT s.name, s.class_no FROM app_state st JOIN students s ON s.dataset_id = st.active_dataset_id
       WHERE st.id = 1 AND s.email = ?`,
    )
    .bind(email)
    .first<{ name: string; class_no: number }>();
}

export type LogFilter = { q: string; outcome: LookupOutcome | ""; before: number | null };
export const LOG_PAGE_SIZE = 100;

export async function listLookups(db: D1Database, f: LogFilter): Promise<{ entries: LookupLogEntry[]; hasMore: boolean }> {
  const where: string[] = [];
  const binds: (string | number)[] = [];
  if (f.q) {
    where.push("(email LIKE ? ESCAPE '\\' OR student_name LIKE ? ESCAPE '\\')");
    const like = `%${f.q.replace(/[\\%_]/g, (m) => "\\" + m)}%`;
    binds.push(like, like);
  }
  if (f.outcome) {
    where.push("outcome = ?");
    binds.push(f.outcome);
  }
  if (f.before) {
    where.push("id < ?");
    binds.push(f.before);
  }
  const sql = `SELECT id, created_at, email, outcome, student_name, class_no FROM lookup_log
               ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY id DESC LIMIT ?`;
  const { results } = await db
    .prepare(sql)
    .bind(...binds, LOG_PAGE_SIZE + 1)
    .all<{ id: number; created_at: string; email: string; outcome: LookupOutcome; student_name: string | null; class_no: number | null }>();
  return {
    hasMore: results.length > LOG_PAGE_SIZE,
    entries: results.slice(0, LOG_PAGE_SIZE).map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      email: r.email,
      outcome: r.outcome,
      studentName: r.student_name,
      classNo: r.class_no,
    })),
  };
}

/** Counts for the last 24 hours and distinct students who opened their report in the kept log. */
export async function lookupSummary(db: D1Database) {
  const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
  return db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM lookup_log WHERE created_at >= ?1) AS day_total,
         (SELECT COUNT(*) FROM lookup_log WHERE created_at >= ?1 AND outcome = 'success') AS day_success,
         (SELECT COUNT(*) FROM lookup_log WHERE created_at >= ?1 AND outcome <> 'success') AS day_failed,
         (SELECT COUNT(DISTINCT email) FROM lookup_log WHERE outcome = 'success') AS students_viewed`,
    )
    .bind(since)
    .first<{ day_total: number; day_success: number; day_failed: number; students_viewed: number }>();
}

export type ClassCoverage = { classNo: number; total: number; viewed: number };

/** Per class in the live data: how many students' reports were opened at least once (within the kept log). */
export async function coverageByClass(db: D1Database): Promise<ClassCoverage[]> {
  const { results } = await db
    .prepare(
      `SELECT s.class_no, COUNT(*) AS total, COUNT(v.email) AS viewed
       FROM app_state st
       JOIN students s ON s.dataset_id = st.active_dataset_id
       LEFT JOIN (SELECT DISTINCT email FROM lookup_log WHERE outcome = 'success') v ON v.email = s.email
       WHERE st.id = 1
       GROUP BY s.class_no ORDER BY s.class_no`,
    )
    .all<{ class_no: number; total: number; viewed: number }>();
  return results.map((r) => ({ classNo: r.class_no, total: r.total, viewed: r.viewed }));
}

export type DailyActivity = { day: string; total: number; success: number; failed: number };

/** Attempts per Saudi calendar day (UTC+3, no DST) for the last `days` days. */
export async function dailyActivity(db: D1Database, days = 14): Promise<DailyActivity[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { results } = await db
    .prepare(
      `SELECT substr(datetime(created_at, '+3 hours'), 1, 10) AS day, COUNT(*) AS total,
              SUM(outcome = 'success') AS success, SUM(outcome <> 'success') AS failed
       FROM lookup_log WHERE created_at >= ? GROUP BY day ORDER BY day DESC`,
    )
    .bind(since)
    .all<DailyActivity>();
  return results;
}

/** Every kept row, oldest first, for CSV export. */
export async function allLookups(db: D1Database): Promise<LookupLogEntry[]> {
  const { results } = await db
    .prepare("SELECT id, created_at, email, outcome, student_name, class_no FROM lookup_log ORDER BY id")
    .all<{ id: number; created_at: string; email: string; outcome: LookupOutcome; student_name: string | null; class_no: number | null }>();
  return results.map((r) => ({ id: r.id, createdAt: r.created_at, email: r.email, outcome: r.outcome, studentName: r.student_name, classNo: r.class_no }));
}
