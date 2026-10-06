/** Client-safe helpers for the 8-digit access code (no secrets here). */
export const ACCESS_CODE_LENGTH = 8;

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
const EXTENDED_ARABIC_INDIC = "۰۱۲۳۴۵۶۷۸۹";

/** Converts Arabic-Indic digits to Latin and drops spaces/dashes. Returns null if not 8 digits. */
export function normalizeAccessCode(input: string): string | null {
  let out = "";
  for (const ch of input) {
    const a = ARABIC_INDIC.indexOf(ch);
    const e = EXTENDED_ARABIC_INDIC.indexOf(ch);
    if (a >= 0) out += String(a);
    else if (e >= 0) out += String(e);
    else if (/[0-9]/.test(ch)) out += ch;
    else if (/[\s\-–—_]/.test(ch)) continue;
    else return null;
  }
  return out.length === ACCESS_CODE_LENGTH ? out : null;
}

/** 12345678 → "1234 5678" for printing. */
export function formatAccessCode(code: string): string {
  return `${code.slice(0, 4)} ${code.slice(4)}`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(input: string): string {
  return input.trim().replace(/^mailto:/i, "").toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && EMAIL_RE.test(email);
}
