import type { HadithItem, QuranSegment, Recitation } from "./types";

/*
 * Rows imported before recitation columns became dynamic were stored as fixed
 * objects ({ s1..s4 } and { h1, h2 }). They are converted when read, so stored
 * data is never rewritten.
 */
const LEGACY_SEGMENTS = [
  { key: "s1", from: 1, to: 6 },
  { key: "s2", from: 7, to: 16 },
  { key: "s3", from: 17, to: 24 },
  { key: "s4", from: 25, to: 33 },
];
const EMPTY: Recitation = { status: "empty" };

export function normalizeQuran(stored: unknown): QuranSegment[] {
  if (Array.isArray(stored)) return stored as QuranSegment[];
  const obj = (stored ?? {}) as Record<string, Recitation | undefined>;
  return LEGACY_SEGMENTS.map((s) => ({ ...(obj[s.key] ?? EMPTY), from: s.from, to: s.to }));
}

export function normalizeHadith(stored: unknown): HadithItem[] {
  if (Array.isArray(stored)) return stored as HadithItem[];
  const obj = (stored ?? {}) as Record<string, Recitation | undefined>;
  return [1, 2].map((n) => ({ ...(obj[`h${n}`] ?? EMPTY), n }));
}

const ORDINALS = ["الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس", "السابع", "الثامن", "التاسع", "العاشر"];

/** «الحديث الثالث» for hadith 3; plain number beyond ten. */
export function hadithLabel(n: number): string {
  return ORDINALS[n - 1] ? `الحديث ${ORDINALS[n - 1]}` : `الحديث ${n}`;
}
