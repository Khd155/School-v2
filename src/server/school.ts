import { nowIso } from "./env";
import type { SchoolInfo } from "../shared/types";

export type LogoKind = "ministry" | "school";
export const LOGO_KINDS: LogoKind[] = ["ministry", "school"];
export type SchoolSettings = Omit<SchoolInfo, "logos">;

type SettingsRow = {
  school_name: string;
  education_office: string;
  academic_year: string;
  term: string;
  subject: string;
  grade: string;
  enabled_classes: string;
  teacher_name: string;
  footer_text: string;
};

function fromRow(row: SettingsRow): SchoolSettings {
  return {
    schoolName: row.school_name,
    educationOffice: row.education_office,
    academicYear: row.academic_year,
    term: row.term,
    subject: row.subject,
    grade: row.grade,
    enabledClasses: (JSON.parse(row.enabled_classes) as number[]).slice().sort((a, b) => a - b),
    teacherName: row.teacher_name,
    footerText: row.footer_text,
  };
}

export async function getSchoolSettings(db: D1Database): Promise<SchoolSettings> {
  const row = await db.prepare("SELECT * FROM app_settings WHERE id = 1").first<SettingsRow>();
  if (!row) throw new Error("app_settings row missing — run migrations");
  return fromRow(row);
}

/** Settings + logo URLs (cache-busted by content hash) in two cheap queries. */
export async function getSchoolInfo(db: D1Database): Promise<SchoolInfo> {
  const [settings, logos] = await db.batch([
    db.prepare("SELECT * FROM app_settings WHERE id = 1"),
    db.prepare("SELECT kind, sha256 FROM logos"),
  ]);
  const urls: SchoolInfo["logos"] = { ministry: null, school: null };
  for (const r of logos.results as { kind: LogoKind; sha256: string }[]) urls[r.kind] = `/logo/${r.kind}?v=${r.sha256.slice(0, 16)}`;
  return { ...fromRow(settings.results[0] as SettingsRow), logos: urls };
}

export async function getLogo(db: D1Database, kind: LogoKind) {
  const row = await db.prepare("SELECT mime, data FROM logos WHERE kind = ?").bind(kind).first<{ mime: string; data: ArrayBuffer | number[] }>();
  if (!row) return null;
  return { mime: row.mime, data: new Uint8Array(row.data as ArrayBuffer) as Uint8Array<ArrayBuffer> };
}

export async function getSettingsLog(db: D1Database, limit = 15) {
  const { results } = await db
    .prepare("SELECT changed_at, summary FROM settings_log ORDER BY changed_at DESC, id DESC LIMIT ?")
    .bind(limit)
    .all<{ changed_at: string; summary: string }>();
  return results.map((r) => ({ changedAt: r.changed_at, summary: r.summary }));
}

const FIELD_LABELS: Record<keyof SchoolSettings, string> = {
  schoolName: "اسم المدرسة",
  educationOffice: "إدارة التعليم",
  academicYear: "العام الدراسي",
  term: "الفصل الدراسي",
  subject: "اسم المادة",
  grade: "الصف",
  enabledClasses: "الفصول المفعّلة",
  teacherName: "اسم المعلم",
  footerText: "نص التذييل",
};

export type LogoChange =
  | { kind: LogoKind; action: "replace"; mime: string; data: Uint8Array<ArrayBuffer>; sha256: string }
  | { kind: LogoKind; action: "remove" };

/**
 * Saves settings and logo changes atomically (one D1 batch) and appends a log
 * entry. Deliberately does not touch app_state.data_updated_at.
 */
export async function updateSchoolSettings(db: D1Database, next: SchoolSettings, logoChanges: LogoChange[]): Promise<boolean> {
  const current = await getSchoolSettings(db);
  const existingLogos = new Set(
    ((await db.prepare("SELECT kind FROM logos").all<{ kind: LogoKind }>()).results).map((r) => r.kind),
  );
  const changed = (Object.keys(FIELD_LABELS) as (keyof SchoolSettings)[]).filter(
    (k) => JSON.stringify(current[k]) !== JSON.stringify(next[k]),
  );
  const parts = changed.map((k) => FIELD_LABELS[k]);
  const now = nowIso();
  const statements: D1PreparedStatement[] = [];

  if (changed.length > 0) {
    statements.push(
      db
        .prepare(
          `UPDATE app_settings SET school_name = ?, education_office = ?, academic_year = ?, term = ?, subject = ?,
             grade = ?, enabled_classes = ?, teacher_name = ?, footer_text = ?, updated_at = ? WHERE id = 1`,
        )
        .bind(
          next.schoolName,
          next.educationOffice,
          next.academicYear,
          next.term,
          next.subject,
          next.grade,
          JSON.stringify(next.enabledClasses),
          next.teacherName,
          next.footerText,
          now,
        ),
    );
  }
  for (const change of logoChanges) {
    const label = change.kind === "ministry" ? "شعار الوزارة" : "شعار المدرسة";
    if (change.action === "remove") {
      if (!existingLogos.has(change.kind)) continue;
      statements.push(db.prepare("DELETE FROM logos WHERE kind = ?").bind(change.kind));
      parts.push(`حذف ${label}`);
    } else {
      statements.push(
        db
          .prepare(
            `INSERT INTO logos (kind, mime, data, sha256, updated_at) VALUES (?, ?, ?, ?, ?)
             ON CONFLICT (kind) DO UPDATE SET mime = excluded.mime, data = excluded.data, sha256 = excluded.sha256, updated_at = excluded.updated_at`,
          )
          .bind(change.kind, change.mime, change.data, change.sha256, now),
      );
      parts.push(`تحديث ${label}`);
    }
  }
  if (statements.length === 0) return false;
  statements.push(db.prepare("INSERT INTO settings_log (changed_at, summary) VALUES (?, ?)").bind(now, "تعديل: " + parts.join("، ")));
  await db.batch(statements);
  return true;
}
