import { isValidEmail, normalizeEmail } from "../access-code-format";
import type { Cell, GridSheet } from "./grid";
import type {
  ClassStats,
  HadithKey,
  QuranSegmentKey,
  Recitation,
  ScoreKey,
  Scores,
  ScoreValue,
  StudentRecord,
} from "../types";

export type IssueLevel = "error" | "warning";
export type ImportIssue = { level: IssueLevel; row: number | null; message: string };

export type ImportResult = {
  sheetName: string;
  headerRow: number;
  students: StudentRecord[];
  issues: ImportIssue[];
  /** Student count per class number found in the file (including invalid classes). */
  classCounts: Record<string, number>;
  stats: ClassStats[];
};

export class ImportFileError extends Error {}

/* ------------------------------------------------------------------ */
/* Column mapping                                                       */
/* ------------------------------------------------------------------ */

type ColumnKey =
  | "name"
  | "email"
  | "class"
  | ScoreKey
  | "note"
  | `quran_${QuranSegmentKey}`
  | `hadith_${HadithKey}`;

type ColumnSpec = { key: ColumnKey; header: string; aliases?: string[]; optional?: boolean };

/** Headers exactly as they appear in «الملخص العام.xlsx». */
const COLUMNS: ColumnSpec[] = [
  { key: "name", header: "الطالب" },
  { key: "email", header: "Email" },
  { key: "class", header: "class" },
  { key: "homework", header: "الواجبات" },
  { key: "participation", header: "المشاركة و التفاعل" },
  { key: "performance", header: "المهام الآدائية", aliases: ["المهام الأدائية"] },
  { key: "classworkTotal", header: "المجموع" },
  { key: "quran", header: "القرآن الكريم" },
  { key: "exams", header: "الاختبار التحريري" },
  { key: "quranExamsTotal", header: "المجموع2" },
  { key: "finalTotal", header: "المجموع النهائي" },
  { key: "note", header: "ملاحظة", optional: true },
  { key: "quran_s1", header: "1-6" },
  { key: "quran_s2", header: "7-16" },
  { key: "quran_s3", header: "17-24" },
  { key: "quran_s4", header: "25-33" },
  { key: "hadith_h1", header: "حديث 1" },
  { key: "hadith_h2", header: "حديث2" },
];

/** Normalises header text for matching: whitespace, tatweel, hamza forms, dash variants, case. */
export function normalizeHeader(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/ـ/g, "")
    .replace(/[ً-ْ]/g, "")
    .replace(/[آأإ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/[‐-―−]/g, "-")
    .replace(/\s+/g, "")
    .toLowerCase();
}

/**
 * Verse-range headers come in several forms: «1-6», «من 1 - 6», «الآيات من 1 إلى 6».
 * After normalizeHeader these become e.g. "1-6", "من1-6", "الايات من1الي6" (spaces removed).
 */
const RANGE_HEADER = /^(?:الايات|ايات)?(?:من)?(\d+)(?:-|الي)(\d+)$/;

function headerMatches(cellText: string, spec: ColumnSpec): boolean {
  const n = normalizeHeader(cellText);
  if ([spec.header, ...(spec.aliases ?? [])].some((h) => normalizeHeader(h) === n)) return true;
  const want = normalizeHeader(spec.header).match(RANGE_HEADER);
  const got = n.match(RANGE_HEADER);
  if (!want || !got) return false;
  // Accept the range in either order ("6-1" for "1-6").
  return (want[1] === got[1] && want[2] === got[2]) || (want[1] === got[2] && want[2] === got[1]);
}

/* ------------------------------------------------------------------ */
/* Cell reading                                                         */
/* ------------------------------------------------------------------ */

function cellText(cell: Cell): string {
  switch (cell.kind) {
    case "empty":
      return "";
    case "date":
      return cell.value.slice(0, 10);
    default:
      return String(cell.value);
  }
}

const DIGITS: Record<string, string> = {};
"٠١٢٣٤٥٦٧٨٩".split("").forEach((d, i) => (DIGITS[d] = String(i)));
"۰۱۲۳۴۵۶۷۸۹".split("").forEach((d, i) => (DIGITS[d] = String(i)));

function toLatinNumber(text: string): string {
  return text.replace(/[٠-٩۰-۹]/g, (d) => DIGITS[d]).replace(/[٫]/g, ".").replace(/[٬,](?=\d{3}\b)/g, "");
}

const NUMERIC = /^-?\d+(\.\d+)?$/;

/** Numbers stay numbers; numeric text is parsed; anything else is kept verbatim and excluded from maths. */
export function parseScore(cell: Cell): ScoreValue {
  if (cell.kind === "empty") return { num: null, raw: null };
  if (cell.kind === "number") return { num: cell.value, raw: null };
  const text = cellText(cell).trim();
  const latin = toLatinNumber(text);
  if (NUMERIC.test(latin)) return { num: Number(latin), raw: null };
  return { num: null, raw: text };
}

export function parseRecitation(cell: Cell): Recitation {
  if (cell.kind === "empty") return { status: "empty" };
  const text = cellText(cell).trim();
  const n = text.replace(/[ً-ْـ]/g, "").replace(/\s+/g, "").replace(/[.。]$/, "");
  if (n === "تم") return { status: "done" };
  if (n === "لميتم") return { status: "not_done" };
  return { status: "unknown", raw: text };
}

/* ------------------------------------------------------------------ */
/* Parsing                                                              */
/* ------------------------------------------------------------------ */

const HEADER_SCAN_ROWS = 15;
const TOTAL_TOLERANCE = 0.01;
export const MAX_ROWS = 2000;

const SCORE_LABELS: Record<ScoreKey, string> = {
  homework: "الواجبات",
  participation: "المشاركة والتفاعل",
  performance: "المهام الأدائية",
  classworkTotal: "مجموع أعمال الفصل (المجموع)",
  quran: "القرآن الكريم",
  exams: "الاختبار التحريري",
  quranExamsTotal: "مجموع القرآن والاختبارات (المجموع2)",
  finalTotal: "المجموع النهائي",
};

/** Excel can silently turn a typed "1-6" header into a date (1 Jun / 6 Jan). */
function dateHeaderAsRange(cell: Cell): string | null {
  if (cell.kind !== "date") return null;
  const date = new Date(cell.value);
  const d = date.getUTCDate();
  const m = date.getUTCMonth() + 1;
  return (d === 1 && m === 6) || (d === 6 && m === 1) ? "1-6" : null;
}

function findHeader(sheet: GridSheet): { row: number; map: Map<ColumnKey, number>; missing: ColumnSpec[] } | null {
  const last = Math.min(sheet.rows.length, HEADER_SCAN_ROWS);
  for (let r = 1; r <= last; r++) {
    const texts: { col: number; text: string }[] = [];
    (sheet.rows[r - 1] ?? []).forEach((cell, i) => {
      if (cell.kind !== "empty") texts.push({ col: i + 1, text: dateHeaderAsRange(cell) ?? cellText(cell) });
    });
    const has = (spec: ColumnSpec) => texts.some((t) => headerMatches(t.text, spec));
    const nameSpec = COLUMNS.find((c) => c.key === "name")!;
    const emailSpec = COLUMNS.find((c) => c.key === "email")!;
    if (!has(nameSpec) || !has(emailSpec)) continue;

    const map = new Map<ColumnKey, number>();
    const missing: ColumnSpec[] = [];
    for (const spec of COLUMNS) {
      const hit = texts.find((t) => headerMatches(t.text, spec));
      if (hit) map.set(spec.key, hit.col);
      else missing.push(spec);
    }
    return { row: r, map, missing };
  }
  return null;
}

/**
 * Maps and validates a workbook already read into a cell grid (see grid.ts).
 * Runs on the server; the grid itself is untrusted input.
 */
export function parseGrid(sheetsIn: GridSheet[], enabledClasses: number[], scoreMax?: Partial<Record<ScoreKey, number | null>>): ImportResult {
  // Prefer a sheet named «الملخص العام», otherwise the first sheet with the expected headers.
  const target = normalizeHeader("الملخص العام");
  const sheets = [...sheetsIn].sort((a, b) => Number(normalizeHeader(b.name) === target) - Number(normalizeHeader(a.name) === target));
  let sheet: GridSheet | null = null;
  let header: ReturnType<typeof findHeader> = null;
  for (const s of sheets) {
    header = findHeader(s);
    if (header) {
      sheet = s;
      break;
    }
  }
  if (!sheet || !header) {
    throw new ImportFileError("لم يُعثر على صف العناوين. يجب أن يحتوي الملف على عمودي «الطالب» و«Email».");
  }

  const issues: ImportIssue[] = [];
  const requiredMissing = header.missing.filter((c) => !c.optional);
  if (requiredMissing.length > 0) {
    for (const c of requiredMissing) issues.push({ level: "error", row: null, message: `العمود «${c.header}» غير موجود في الملف.` });
    return { sheetName: sheet.name, headerRow: header.row, students: [], issues, classCounts: {}, stats: [] };
  }
  for (const c of header.missing) issues.push({ level: "warning", row: null, message: `العمود «${c.header}» غير موجود؛ ستظهر قيمته «غير مسجل».` });

  const col = header.map;
  const at = (row: Cell[], key: ColumnKey): Cell => {
    const c = col.get(key);
    return (c && row[c - 1]) || { kind: "empty" };
  };

  const students: StudentRecord[] = [];
  const classCounts: Record<string, number> = {};
  const seenEmails = new Map<string, number>();
  const enabled = new Set(enabledClasses);

  for (let r = header.row + 1; r <= sheet.rows.length; r++) {
    const row = sheet.rows[r - 1] ?? [];
    const cells = COLUMNS.map((c) => at(row, c.key));
    if (cells.every((c) => c.kind === "empty")) continue; // blank spacer rows

    if (students.length >= MAX_ROWS) {
      throw new ImportFileError(`عدد الصفوف يتجاوز الحد المسموح (${MAX_ROWS}).`);
    }

    const name = cellText(at(row, "name")).trim().replace(/\s+/g, " ");
    const email = normalizeEmail(cellText(at(row, "email")));
    const classCell = at(row, "class");
    const classText = toLatinNumber(cellText(classCell).trim());
    const classNo = /^\d+$/.test(classText) ? Number(classText) : NaN;

    if (!name) issues.push({ level: "error", row: r, message: "اسم الطالب فارغ." });
    if (!email) issues.push({ level: "error", row: r, message: "البريد فارغ." });
    else if (!isValidEmail(email)) issues.push({ level: "error", row: r, message: `صيغة البريد غير صحيحة: ${email}` });
    else if (seenEmails.has(email)) {
      issues.push({ level: "error", row: r, message: `البريد ${email} مكرر (ورد أيضًا في الصف ${seenEmails.get(email)}).` });
    } else seenEmails.set(email, r);

    if (classCell.kind === "empty") issues.push({ level: "error", row: r, message: "رقم الفصل فارغ." });
    else if (!Number.isInteger(classNo)) issues.push({ level: "error", row: r, message: `رقم الفصل غير صحيح: «${cellText(classCell)}».` });
    else if (!enabled.has(classNo)) issues.push({ level: "error", row: r, message: `الفصل ${classNo} غير مفعّل في «معلومات المدرسة».` });

    const classKey = Number.isInteger(classNo) ? String(classNo) : "غير صحيح";
    classCounts[classKey] = (classCounts[classKey] ?? 0) + 1;

    const scores = {} as Scores;
    for (const key of Object.keys(SCORE_LABELS) as ScoreKey[]) {
      scores[key] = parseScore(at(row, key));
      if (scores[key].raw !== null) {
        issues.push({ level: "warning", row: r, message: `قيمة غير رقمية في «${SCORE_LABELS[key]}»: «${scores[key].raw}» — ستُعرض كما هي ولن تدخل في الحساب.` });
      }
      const max = scoreMax?.[key];
      const num = scores[key].num;
      if (max && num !== null && num > max + TOTAL_TOLERANCE) {
        issues.push({ level: "warning", row: r, message: `«${SCORE_LABELS[key]}» = ${round(num)} أعلى من الدرجة العظمى (${max}). لم يُعدَّل شيء.` });
      }
    }
    if (scores.finalTotal.num === null && scores.finalTotal.raw === null) {
      issues.push({ level: "warning", row: r, message: "المجموع النهائي فارغ؛ سيُعرض «غير مسجل» ولن يدخل في المتوسط." });
    }
    checkTotal(issues, r, scores, "classworkTotal", ["homework", "participation", "performance"]);
    checkTotal(issues, r, scores, "quranExamsTotal", ["quran", "exams"]);
    checkTotal(issues, r, scores, "finalTotal", ["classworkTotal", "quranExamsTotal"]);

    const quran = {
      s1: parseRecitation(at(row, "quran_s1")),
      s2: parseRecitation(at(row, "quran_s2")),
      s3: parseRecitation(at(row, "quran_s3")),
      s4: parseRecitation(at(row, "quran_s4")),
    };
    const hadith = { h1: parseRecitation(at(row, "hadith_h1")), h2: parseRecitation(at(row, "hadith_h2")) };
    const recitations: [string, Recitation][] = [
      ["الآيات 1–6", quran.s1],
      ["الآيات 7–16", quran.s2],
      ["الآيات 17–24", quran.s3],
      ["الآيات 25–33", quran.s4],
      ["حديث 1", hadith.h1],
      ["حديث 2", hadith.h2],
    ];
    for (const [label, rec] of recitations) {
      if (rec.status === "unknown") {
        issues.push({
          level: "warning",
          row: r,
          message: `حالة تسميع غير معروفة في «${label}»: «${rec.raw}» (المتوقع «تم» أو «لم يتم» أو فارغ). ستُعرض كما هي.`,
        });
      }
    }

    const noteText = cellText(at(row, "note")).trim();
    students.push({
      row: r,
      name,
      email,
      classNo: Number.isInteger(classNo) ? classNo : 0,
      scores,
      quran,
      hadith,
      note: noteText || null,
    });
  }

  if (students.length === 0) issues.push({ level: "error", row: null, message: "لا توجد بيانات طلاب أسفل صف العناوين." });

  return {
    sheetName: sheet.name,
    headerRow: header.row,
    students,
    issues,
    classCounts,
    stats: computeClassStats(students, enabledClasses),
  };
}

function checkTotal(issues: ImportIssue[], row: number, s: Scores, total: ScoreKey, parts: ScoreKey[]) {
  const t = s[total].num;
  const values = parts.map((p) => s[p].num);
  if (t === null || values.some((v) => v === null)) return;
  const sum = (values as number[]).reduce((a, b) => a + b, 0);
  if (Math.abs(sum - t) > TOTAL_TOLERANCE) {
    issues.push({
      level: "warning",
      row,
      message: `«${SCORE_LABELS[total]}» = ${round(t)} بينما مجموع تفاصيله (${parts.map((p) => SCORE_LABELS[p]).join(" + ")}) = ${round(sum)}. لم يُعدَّل شيء.`,
    });
  }
}

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Average and highest final total per class. Zeros count; empty and
 * non-numeric values are excluded (never treated as zero).
 */
export function computeClassStats(students: Pick<StudentRecord, "classNo" | "scores">[], classes: number[]): ClassStats[] {
  return classes.map((classNo) => {
    const inClass = students.filter((s) => s.classNo === classNo);
    const values = inClass.map((s) => s.scores.finalTotal.num).filter((n): n is number => n !== null);
    return {
      classNo,
      average: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
      highest: values.length ? Math.max(...values) : null,
      counted: values.length,
      total: inClass.length,
    };
  });
}
