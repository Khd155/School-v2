/** A grade cell as read from the sheet. `num` is null for empty or non-numeric cells. */
export type ScoreValue = {
  num: number | null;
  /** Original text when the cell is non-empty but not numeric (kept as-is). */
  raw: string | null;
};

export const SCORE_KEYS = [
  "homework",
  "participation",
  "performance",
  "classworkTotal",
  "quran",
  "exams",
  "quranExamsTotal",
  "finalTotal",
] as const;
export type ScoreKey = (typeof SCORE_KEYS)[number];
export type Scores = Record<ScoreKey, ScoreValue>;

export type RecitationStatus = "done" | "not_done" | "empty" | "unknown";
export type Recitation = { status: RecitationStatus; raw?: string };

export const QURAN_SEGMENTS = [
  { key: "s1", from: 1, to: 6 },
  { key: "s2", from: 7, to: 16 },
  { key: "s3", from: 17, to: 24 },
  { key: "s4", from: 25, to: 33 },
] as const;
export type QuranSegmentKey = (typeof QURAN_SEGMENTS)[number]["key"];
export type QuranRecitation = Record<QuranSegmentKey, Recitation>;

export const HADITH_KEYS = ["h1", "h2"] as const;
export type HadithKey = (typeof HADITH_KEYS)[number];
export type HadithRecitation = Record<HadithKey, Recitation>;

export type StudentRecord = {
  /** 1-based row number in the source sheet, for error reporting. */
  row: number;
  name: string;
  email: string;
  classNo: number;
  scores: Scores;
  quran: QuranRecitation;
  hadith: HadithRecitation;
  note: string | null;
};

export type ClassStats = {
  classNo: number;
  average: number | null;
  highest: number | null;
  /** Students with a numeric final total (included in the stats). */
  counted: number;
  total: number;
};

export type SchoolInfo = {
  schoolName: string;
  educationOffice: string;
  academicYear: string;
  term: string;
  subject: string;
  grade: string;
  enabledClasses: number[];
  teacherName: string;
  footerText: string;
  /** When false, parents look up results with the school e-mail only. */
  requireAccessCode: boolean;
  logos: { ministry: string | null; school: string | null };
};

export type StudentReport = {
  student: Omit<StudentRecord, "row">;
  stats: ClassStats | null;
  dataUpdatedAt: string | null;
};
