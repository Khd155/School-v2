import type { ScoreKey } from "../shared/types";

export const SCORE_FIELDS: { key: ScoreKey; label: string }[] = [
  { key: "homework", label: "الواجبات" },
  { key: "participation", label: "المشاركة والتفاعل" },
  { key: "performance", label: "المهام الأدائية" },
  { key: "classworkTotal", label: "مجموع أعمال الفصل" },
  { key: "quran", label: "القرآن الكريم" },
  { key: "exams", label: "الاختبارات" },
  { key: "quranExamsTotal", label: "مجموع القرآن والاختبارات" },
  { key: "finalTotal", label: "المجموع النهائي" },
];

export type GradeQuery = {
  field: ScoreKey;
  classNo: number | null;
  order: "asc" | "desc";
  limit: number | null;
  /** Only values strictly below this number. */
  below: number | null;
};

export type GradeRow = { name: string; email: string; classNo: number; value: number };
export type GradeResult = { rows: GradeRow[]; considered: number; notRecorded: number };

/**
 * Ranks students in the live data by one grade. Only numeric values are ranked;
 * empty or non-numeric cells are counted separately and never treated as zero.
 * `field` comes from SCORE_FIELDS (an allowlist), so the JSON path is safe to inline.
 */
export async function rankByGrade(db: D1Database, q: GradeQuery): Promise<GradeResult> {
  if (!SCORE_FIELDS.some((f) => f.key === q.field)) throw new Error("unknown field");
  const value = `json_extract(s.scores, '$.${q.field}.num')`;
  const base = `FROM app_state st JOIN students s ON s.dataset_id = st.active_dataset_id
                WHERE st.id = 1 AND (?1 IS NULL OR s.class_no = ?1)`;
  const [ranked, counts] = await db.batch([
    db
      .prepare(
        `SELECT s.name, s.email, s.class_no, ${value} AS value ${base}
         AND ${value} IS NOT NULL AND (?2 IS NULL OR ${value} < ?2)
         ORDER BY ${value} ${q.order === "asc" ? "ASC" : "DESC"}, s.class_no, s.name
         LIMIT ?3`,
      )
      .bind(q.classNo, q.below, q.limit ?? -1),
    db.prepare(`SELECT COUNT(${value}) AS considered, COUNT(*) - COUNT(${value}) AS not_recorded ${base}`).bind(q.classNo),
  ]);
  const c = counts.results[0] as { considered: number; not_recorded: number };
  return {
    rows: (ranked.results as { name: string; email: string; class_no: number; value: number }[]).map((r) => ({
      name: r.name,
      email: r.email,
      classNo: r.class_no,
      value: r.value,
    })),
    considered: c.considered,
    notRecorded: c.not_recorded,
  };
}

/** Parses and validates the page's query string; anything unexpected falls back to defaults. */
export function parseGradeQuery(params: URLSearchParams, classes: number[]): GradeQuery {
  const field = SCORE_FIELDS.find((f) => f.key === params.get("field"))?.key ?? "finalTotal";
  const cls = Number(params.get("class"));
  const limitParam = params.get("limit");
  const limit = limitParam === "all" ? null : [10, 20, 50].includes(Number(limitParam)) ? Number(limitParam) : 10;
  const belowRaw = (params.get("below") ?? "").trim().replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace("٫", ".");
  const below = belowRaw !== "" && Number.isFinite(Number(belowRaw)) ? Number(belowRaw) : null;
  return {
    field,
    classNo: classes.includes(cls) ? cls : null,
    order: params.get("order") === "desc" ? "desc" : "asc",
    limit,
    below,
  };
}
