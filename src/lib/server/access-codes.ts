import "server-only";
import { db } from "./db";
import { generateAccessCode, getDummyHash, hashSecret, verifySecret } from "./crypto";

export type IssuedCode = { email: string; code: string };

/**
 * Issues fresh codes for the given e-mails. Only the hash is stored; the
 * plain codes are returned once so the teacher can export them.
 * Bumping `version` invalidates parent sessions opened with the old code.
 */
export async function issueCodes(emails: string[]): Promise<IssuedCode[]> {
  const issued: { email: string; code: string; hash: string }[] = [];
  for (let i = 0; i < emails.length; i += 8) {
    const batch = emails.slice(i, i + 8);
    const hashed = await Promise.all(
      batch.map(async (email) => {
        const code = generateAccessCode();
        return { email, code, hash: await hashSecret(code) };
      }),
    );
    issued.push(...hashed);
  }
  if (issued.length === 0) return [];

  await db().begin(async (tx) => {
    for (const row of issued) {
      await tx`
        insert into access_codes (email, code_hash, generated_at, version)
        values (${row.email}, ${row.hash}, now(), 1)
        on conflict (email) do update set
          code_hash = excluded.code_hash,
          generated_at = now(),
          version = access_codes.version + 1
      `;
    }
  });
  return issued.map(({ email, code }) => ({ email, code }));
}

/** Returns the code version on success. Spends the same time whether or not the e-mail exists. */
export async function verifyAccessCode(email: string, code: string): Promise<number | null> {
  const [row] = await db()`select code_hash, version from access_codes where email = ${email}`;
  const ok = await verifySecret(code, row?.code_hash ?? (await getDummyHash()));
  return row && ok ? Number(row.version) : null;
}

export async function getCodeVersion(email: string): Promise<number | null> {
  const [row] = await db()`select version from access_codes where email = ${email}`;
  return row ? Number(row.version) : null;
}
