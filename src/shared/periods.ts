/** Two semesters × two periods. The key order is chronological. */
export const PERIODS = [
  { key: "t1p1", term: "الفصل الدراسي الأول", period: "الفترة الأولى" },
  { key: "t1p2", term: "الفصل الدراسي الأول", period: "الفترة الثانية" },
  { key: "t2p1", term: "الفصل الدراسي الثاني", period: "الفترة الأولى" },
  { key: "t2p2", term: "الفصل الدراسي الثاني", period: "الفترة الثانية" },
] as const;

export type PeriodKey = (typeof PERIODS)[number]["key"];

export function isPeriodKey(v: unknown): v is PeriodKey {
  return typeof v === "string" && PERIODS.some((p) => p.key === v);
}

/** «الفصل الدراسي الأول — الفترة الأولى» */
export function periodLabel(key: PeriodKey): string {
  const p = PERIODS.find((x) => x.key === key)!;
  return `${p.term} — ${p.period}`;
}

/** «الفصل الأول، الفترة الأولى» — compact form for selectors. */
export function periodShortLabel(key: PeriodKey): string {
  const p = PERIODS.find((x) => x.key === key)!;
  return `${p.term.replace("الدراسي ", "")}، ${p.period}`;
}
