import type { ScoreValue } from "./types";

export const NOT_RECORDED = "غير مسجل";

const numberFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
  useGrouping: false,
});

/** Up to two decimals, trailing zeros dropped (15 → "15", 14.5 → "14.5", 9.876 → "9.88"). */
export function formatNumber(value: number): string {
  // Normalise -0 produced by rounding tiny negatives.
  const text = numberFormat.format(value);
  return text === "-0" ? "0" : text;
}

/** Display form of a sheet cell: number, original text, or «غير مسجل». */
export function formatScore(value: ScoreValue | null | undefined): string {
  if (!value) return NOT_RECORDED;
  if (value.num !== null) return formatNumber(value.num);
  if (value.raw) return value.raw;
  return NOT_RECORDED;
}

export function isRecorded(value: ScoreValue | null | undefined): boolean {
  return !!value && (value.num !== null || !!value.raw);
}

const RIYADH = "Asia/Riyadh";

// Formatters are created on first use (ICU initialisation is comparatively expensive).
let dateTimeFormat: Intl.DateTimeFormat | null = null;
let dateFormat: Intl.DateTimeFormat | null = null;

const dateTimeOptions: Intl.DateTimeFormatOptions = {
  timeZone: RIYADH,
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
};

/** e.g. «6 أكتوبر 2026، 8:45 م» in Saudi time, Gregorian calendar, Latin digits. */
export function formatDateTimeRiyadh(value: Date | string): string {
  dateTimeFormat ??= new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", dateTimeOptions);
  return dateTimeFormat.format(typeof value === "string" ? new Date(value) : value);
}

export function formatDateRiyadh(value: Date | string): string {
  dateFormat ??= new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { timeZone: RIYADH, year: "numeric", month: "long", day: "numeric" });
  return dateFormat.format(typeof value === "string" ? new Date(value) : value);
}

/** [4, 5, 6] → «4 و5 و6». */
export function formatClassList(classes: number[]): string {
  if (classes.length === 0) return "";
  if (classes.length === 1) return String(classes[0]);
  return classes.map((c, i) => (i === 0 ? String(c) : `و${c}`)).join(" ");
}
