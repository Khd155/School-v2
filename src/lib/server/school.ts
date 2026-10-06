import "server-only";
import { db } from "./db";
import type { SchoolInfo } from "@/lib/types";

export type LogoKind = "ministry" | "school";
export const LOGO_KINDS: LogoKind[] = ["ministry", "school"];

export type SchoolSettings = Omit<SchoolInfo, "logos">;

export async function getSchoolSettings(): Promise<SchoolSettings> {
  const [row] = await db()`select * from app_settings where id = 1`;
  return {
    schoolName: row.school_name,
    educationOffice: row.education_office,
    academicYear: row.academic_year,
    term: row.term,
    subject: row.subject,
    grade: row.grade,
    enabledClasses: (row.enabled_classes as number[]).slice().sort((a, b) => a - b),
    teacherName: row.teacher_name,
    footerText: row.footer_text,
  };
}

/** Public logo URLs, cache-busted by content hash. */
export async function getLogoUrls(): Promise<SchoolInfo["logos"]> {
  const rows = await db()`select kind, sha256 from logos`;
  const urls: SchoolInfo["logos"] = { ministry: null, school: null };
  for (const r of rows) urls[r.kind as LogoKind] = `/api/logo/${r.kind}?v=${String(r.sha256).slice(0, 16)}`;
  return urls;
}

/** Logos inlined as data URIs (used by the PDF renderer, which has no network access to the app). */
export async function getLogoDataUris(): Promise<SchoolInfo["logos"]> {
  const rows = await db()`select kind, mime, data from logos`;
  const uris: SchoolInfo["logos"] = { ministry: null, school: null };
  for (const r of rows) uris[r.kind as LogoKind] = `data:${r.mime};base64,${Buffer.from(r.data).toString("base64")}`;
  return uris;
}

export async function getSchoolInfo(): Promise<SchoolInfo> {
  const [settings, logos] = await Promise.all([getSchoolSettings(), getLogoUrls()]);
  return { ...settings, logos };
}

export async function getLogo(kind: LogoKind) {
  const [row] = await db()`select mime, data, sha256 from logos where kind = ${kind}`;
  return row ? { mime: row.mime as string, data: Buffer.from(row.data), sha256: row.sha256 as string } : null;
}

export async function getSettingsLog(limit = 15) {
  const rows = await db()`select changed_at, summary from settings_log order by changed_at desc limit ${limit}`;
  return rows.map((r) => ({ changedAt: new Date(r.changed_at).toISOString(), summary: r.summary as string }));
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

export type LogoChange = { kind: LogoKind; action: "replace"; mime: string; data: Buffer; sha256: string } | { kind: LogoKind; action: "remove" };

/**
 * Saves settings and logo changes in one transaction and appends a log entry.
 * Deliberately does not touch app_state.data_updated_at.
 */
export async function updateSchoolSettings(next: SchoolSettings, logoChanges: LogoChange[]): Promise<boolean> {
  return db().begin(async (tx) => {
    const [cur] = await tx`select * from app_settings where id = 1 for update`;
    const current: SchoolSettings = {
      schoolName: cur.school_name,
      educationOffice: cur.education_office,
      academicYear: cur.academic_year,
      term: cur.term,
      subject: cur.subject,
      grade: cur.grade,
      enabledClasses: (cur.enabled_classes as number[]).slice().sort((a, b) => a - b),
      teacherName: cur.teacher_name,
      footerText: cur.footer_text,
    };

    const changed = (Object.keys(FIELD_LABELS) as (keyof SchoolSettings)[]).filter(
      (k) => JSON.stringify(current[k]) !== JSON.stringify(next[k]),
    );
    const parts = changed.map((k) => FIELD_LABELS[k]);

    for (const change of logoChanges) {
      const label = change.kind === "ministry" ? "شعار الوزارة" : "شعار المدرسة";
      if (change.action === "remove") {
        const res = await tx`delete from logos where kind = ${change.kind}`;
        if (res.count > 0) parts.push(`حذف ${label}`);
      } else {
        await tx`
          insert into logos (kind, mime, data, sha256, updated_at)
          values (${change.kind}, ${change.mime}, ${change.data}, ${change.sha256}, now())
          on conflict (kind) do update set mime = excluded.mime, data = excluded.data, sha256 = excluded.sha256, updated_at = now()
        `;
        parts.push(`تحديث ${label}`);
      }
    }

    if (parts.length === 0) return false;

    if (changed.length > 0) {
      await tx`
        update app_settings set
          school_name = ${next.schoolName},
          education_office = ${next.educationOffice},
          academic_year = ${next.academicYear},
          term = ${next.term},
          subject = ${next.subject},
          grade = ${next.grade},
          enabled_classes = ${next.enabledClasses},
          teacher_name = ${next.teacherName},
          footer_text = ${next.footerText},
          updated_at = now()
        where id = 1
      `;
    }
    await tx`insert into settings_log (summary) values (${"تعديل: " + parts.join("، ")})`;
    return true;
  });
}
