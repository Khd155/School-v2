import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "./db";
import type { ImportResult } from "@/lib/import/parse";
import type { ClassStats, StudentRecord, StudentReport } from "@/lib/types";

/** Number of approved versions kept for restore. Older ones are pruned on commit. */
export const KEPT_VERSIONS = 10;
const DRAFT_TTL_MINUTES = 60;

export type DataState = {
  activeDatasetId: number | null;
  dataUpdatedAt: string | null;
};

export async function getDataState(): Promise<DataState> {
  const [row] = await db()`select active_dataset_id, data_updated_at from app_state where id = 1`;
  return {
    activeDatasetId: row?.active_dataset_id ? Number(row.active_dataset_id) : null,
    dataUpdatedAt: row?.data_updated_at ? new Date(row.data_updated_at).toISOString() : null,
  };
}

/** Looks up one student in the live dataset. Never returns other students' data. */
export async function getStudentReport(email: string): Promise<StudentReport | null> {
  const [row] = await db()`
    select s.name, s.email, s.class_no, s.scores, s.quran, s.hadith, s.note,
           cs.average, cs.highest, cs.counted, cs.total, st.data_updated_at
    from app_state st
    join students s on s.dataset_id = st.active_dataset_id
    left join class_stats cs on cs.dataset_id = s.dataset_id and cs.class_no = s.class_no
    where st.id = 1 and s.email = ${email}
  `;
  if (!row) return null;
  const stats: ClassStats | null =
    row.counted === null
      ? null
      : {
          classNo: row.class_no,
          average: row.average === null ? null : Number(row.average),
          highest: row.highest === null ? null : Number(row.highest),
          counted: row.counted,
          total: row.total,
        };
  return {
    student: {
      name: row.name,
      email: row.email,
      classNo: row.class_no,
      scores: row.scores,
      quran: row.quran,
      hadith: row.hadith,
      note: row.note,
    },
    stats,
    dataUpdatedAt: row.data_updated_at ? new Date(row.data_updated_at).toISOString() : null,
  };
}

/* ---------------- Import drafts ---------------- */

export type DraftPayload = ImportResult & { filename: string; enabledClasses: number[] };

export async function saveDraft(payload: DraftPayload): Promise<string> {
  const id = randomUUID();
  await db()`delete from import_drafts where expires_at < now()`;
  await db()`
    insert into import_drafts (id, expires_at, payload)
    values (${id}, now() + ${`${DRAFT_TTL_MINUTES} minutes`}::interval, ${db().json(payload as never)})
  `;
  return id;
}

export type CommitResult =
  | { ok: true; datasetId: number; dataUpdatedAt: string }
  | { ok: false; reason: "not_found" | "has_errors" | "classes_changed" };

/**
 * Approves a draft: inserts a new dataset version, computes class stats and
 * switches the live pointer — all in one transaction. On any failure the
 * previous data stays live. The draft row is consumed inside the same
 * transaction, so a double-submit commits only once.
 */
export async function commitDraft(draftId: string, currentEnabledClasses: number[]): Promise<CommitResult> {
  return db().begin(async (tx) => {
    await tx`select 1 from app_state where id = 1 for update`;
    const [draft] = await tx`
      delete from import_drafts where id = ${draftId} and expires_at > now() returning payload
    `;
    if (!draft) return { ok: false, reason: "not_found" } as const;
    const payload = draft.payload as DraftPayload;

    if (payload.issues.some((i) => i.level === "error") || payload.students.length === 0) {
      return { ok: false, reason: "has_errors" } as const;
    }
    // Classes were validated against the settings at upload time; re-check they still hold.
    const enabled = new Set(currentEnabledClasses);
    if (payload.students.some((s) => !enabled.has(s.classNo))) {
      return { ok: false, reason: "classes_changed" } as const;
    }

    const warningCount = payload.issues.filter((i) => i.level === "warning").length;
    const [dataset] = await tx`
      insert into datasets (source_filename, sheet_name, student_count, class_counts, warning_count)
      values (${payload.filename}, ${payload.sheetName}, ${payload.students.length},
              ${tx.json(payload.classCounts)}, ${warningCount})
      returning id, committed_at
    `;
    const datasetId = Number(dataset.id);

    const rows = payload.students.map((s: StudentRecord) => ({
      dataset_id: datasetId,
      source_row: s.row,
      name: s.name,
      email: s.email,
      class_no: s.classNo,
      scores: tx.json(s.scores as never),
      quran: tx.json(s.quran as never),
      hadith: tx.json(s.hadith as never),
      note: s.note,
    }));
    // Batch to stay well under the bind-parameter limit.
    for (let i = 0; i < rows.length; i += 200) {
      await tx`insert into students ${tx(rows.slice(i, i + 200) as never[])}`;
    }

    // Stats are recomputed in SQL from the inserted rows, so they always match stored data.
    await tx`
      insert into class_stats (dataset_id, class_no, average, highest, counted, total)
      select ${datasetId}, class_no,
             avg((scores->'finalTotal'->>'num')::numeric),
             max((scores->'finalTotal'->>'num')::numeric),
             count(scores->'finalTotal'->>'num'),
             count(*)
      from students where dataset_id = ${datasetId}
      group by class_no
    `;

    const [state] = await tx`
      insert into app_state (id, active_dataset_id, data_updated_at) values (1, ${datasetId}, now())
      on conflict (id) do update set active_dataset_id = excluded.active_dataset_id, data_updated_at = excluded.data_updated_at
      returning data_updated_at
    `;

    await tx`
      delete from datasets where id not in (
        select id from datasets order by committed_at desc, id desc limit ${KEPT_VERSIONS}
      ) and id <> ${datasetId}
    `;

    return { ok: true, datasetId, dataUpdatedAt: new Date(state.data_updated_at).toISOString() } as const;
  });
}

export async function getDraft(draftId: string): Promise<DraftPayload | null> {
  const [row] = await db()`select payload from import_drafts where id = ${draftId} and expires_at > now()`;
  return row ? (row.payload as DraftPayload) : null;
}

export async function discardDraft(draftId: string): Promise<void> {
  await db()`delete from import_drafts where id = ${draftId}`;
}

/* ---------------- Versions ---------------- */

export type DatasetVersion = {
  id: number;
  committedAt: string;
  filename: string;
  studentCount: number;
  classCounts: Record<string, number>;
  warningCount: number;
  active: boolean;
};

export async function listVersions(): Promise<DatasetVersion[]> {
  const rows = await db()`
    select d.*, (d.id = st.active_dataset_id) as active
    from datasets d cross join app_state st
    where st.id = 1
    order by d.committed_at desc, d.id desc
  `;
  return rows.map((r) => ({
    id: Number(r.id),
    committedAt: new Date(r.committed_at).toISOString(),
    filename: r.source_filename,
    studentCount: r.student_count,
    classCounts: r.class_counts,
    warningCount: r.warning_count,
    active: !!r.active,
  }));
}

/**
 * Makes an earlier version live again. The "last data update" moves to now,
 * because that is when the data shown to parents changed.
 */
export async function restoreVersion(datasetId: number): Promise<boolean> {
  return db().begin(async (tx) => {
    await tx`select 1 from app_state where id = 1 for update`;
    const [exists] = await tx`select id from datasets where id = ${datasetId}`;
    if (!exists) return false;
    await tx`
      insert into app_state (id, active_dataset_id, data_updated_at) values (1, ${datasetId}, now())
      on conflict (id) do update set active_dataset_id = excluded.active_dataset_id, data_updated_at = excluded.data_updated_at
    `;
    return true;
  });
}

export async function getActiveClassStats(): Promise<ClassStats[]> {
  const rows = await db()`
    select cs.* from class_stats cs join app_state st on st.active_dataset_id = cs.dataset_id
    where st.id = 1 order by cs.class_no
  `;
  return rows.map((r) => ({
    classNo: r.class_no,
    average: r.average === null ? null : Number(r.average),
    highest: r.highest === null ? null : Number(r.highest),
    counted: r.counted,
    total: r.total,
  }));
}

/* ---------------- Students for the codes page ---------------- */

export type CodeRosterEntry = {
  name: string;
  email: string;
  classNo: number;
  codeGeneratedAt: string | null;
};

export async function getCodeRoster(): Promise<CodeRosterEntry[]> {
  const rows = await db()`
    select s.name, s.email, s.class_no, ac.generated_at
    from app_state st
    join students s on s.dataset_id = st.active_dataset_id
    left join access_codes ac on ac.email = s.email
    where st.id = 1
    order by s.class_no, s.name
  `;
  return rows.map((r) => ({
    name: r.name,
    email: r.email,
    classNo: r.class_no,
    codeGeneratedAt: r.generated_at ? new Date(r.generated_at).toISOString() : null,
  }));
}
