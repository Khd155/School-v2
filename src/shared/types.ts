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
export type ScoreMax = Record<ScoreKey, number | null>;

export type RecitationStatus = "done" | "not_done" | "empty" | "unknown";
/**
 * One recitation cell. Text files use «تم / لم يتم»; later periods record a
 * numeric score per segment instead ({ status: "scored" }).
 */
export type Recitation = { status: RecitationStatus; raw?: string } | { status: "scored"; score: number };

/** A Surat Al-Qalam segment (verse range) as found in the file's headers. */
export type QuranSegment = Recitation & { from: number; to: number };
/** A hadith column («حديث 3» → n = 3). */
export type HadithItem = Recitation & { n: number };

/** Maximum per recitation item, per period (null = show the score without «من»). */
export type RecitationMax = { segment: number | null; hadith: number | null };

export type StudentRecord = {
  /** 1-based row number in the source sheet, for error reporting. */
  row: number;
  name: string;
  email: string;
  classNo: number;
  scores: Scores;
  quran: QuranSegment[];
  hadith: HadithItem[];
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
  /** Which semester/period this report belongs to, and that period's maximum grades. */
  period: import("./periods").PeriodKey;
  scoreMax: ScoreMax;
  recitationMax: RecitationMax;
};
