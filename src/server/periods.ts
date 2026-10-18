import { nowIso } from "./env";
import { isPeriodKey, periodLabel, PERIODS, type PeriodKey } from "../shared/periods";
import { SCORE_KEYS, type ScoreMax } from "../shared/types";

export type PeriodInfo = {
  key: PeriodKey;
  label: string;
  visible: boolean;
  activeDatasetId: number | null;
  dataUpdatedAt: string | null;
  studentCount: number | null;
  scoreMax: ScoreMax;
};

type PeriodRow = {
  key: PeriodKey;
  active_dataset_id: number | null;
  data_updated_at: string | null;
  visible: number;
  score_max: string;
  student_count: number | null;
};

export function parseScoreMax(raw: string | null): ScoreMax {
  let obj: Record<string, unknown> = {};
  try {
    obj = JSON.parse(raw ?? "{}") ?? {};
  } catch {
    /* all null */
  }
  const out = {} as ScoreMax;
  for (const key of SCORE_KEYS) {
    const v = obj[key];
    out[key] = typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
  }
  return out;
}

const fromRow = (r: PeriodRow): PeriodInfo => ({
  key: r.key,
  label: periodLabel(r.key),
  visible: r.visible === 1,
  activeDatasetId: r.active_dataset_id,
  dataUpdatedAt: r.data_updated_at,
  studentCount: r.student_count,
  scoreMax: parseScoreMax(r.score_max),
});

/** All four periods in chronological order. */
export async function getPeriods(db: D1Database): Promise<PeriodInfo[]> {
  const { results } = await db
    .prepare(
      `SELECT p.key, p.active_dataset_id, p.data_updated_at, p.visible, p.score_max, d.student_count
       FROM periods p LEFT JOIN datasets d ON d.id = p.active_dataset_id ORDER BY p.sort`,
    )
    .all<PeriodRow>();
  return results.map(fromRow);
}

export async function getPeriod(db: D1Database, key: PeriodKey): Promise<PeriodInfo> {
  return (await getPeriods(db)).find((p) => p.key === key)!;
}

/** Periods parents may see: marked visible and with published data. Latest first. */
export function publishedPeriods(periods: PeriodInfo[]): PeriodInfo[] {
  return periods.filter((p) => p.visible && p.activeDatasetId !== null).reverse();
}

/** Teacher's working period: the cookie's choice, else the latest period with data, else the first. */
export function resolveWorkingPeriod(periods: PeriodInfo[], requested: string | undefined): PeriodKey {
  if (isPeriodKey(requested)) return requested;
  const withData = periods.filter((p) => p.activeDatasetId !== null);
  return withData.length ? withData[withData.length - 1].key : PERIODS[0].key;
}

/** Saves one period's visibility and maximum grades, with a change-log entry. */
export async function updatePeriod(db: D1Database, key: PeriodKey, visible: boolean, scoreMax: ScoreMax): Promise<boolean> {
  const current = await getPeriod(db, key);
  const parts: string[] = [];
  if (current.visible !== visible) parts.push(visible ? "إظهار لأولياء الأمور" : "إخفاء عن أولياء الأمور");
  if (JSON.stringify(current.scoreMax) !== JSON.stringify(scoreMax)) parts.push("الدرجات العظمى");
  if (parts.length === 0) return false;
  await db.batch([
    db.prepare("UPDATE periods SET visible = ?, score_max = ? WHERE key = ?").bind(visible ? 1 : 0, JSON.stringify(scoreMax), key),
    db.prepare("INSERT INTO settings_log (changed_at, summary) VALUES (?, ?)").bind(nowIso(), `${periodLabel(key)}: ${parts.join("، ")}`),
  ]);
  return true;
}
