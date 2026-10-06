import { normalizeEmail } from "@/lib/access-code-format";
import { issueCodes } from "@/lib/server/access-codes";
import { requireAdminApi } from "@/lib/server/admin-auth";
import { jsonError, jsonOk } from "@/lib/server/request";
import { getCodeRoster } from "@/lib/server/students";

export const maxDuration = 60;

/**
 * Issues access codes for students in the live data.
 * mode "missing": only students without a code; "all": everyone (old codes stop working);
 * "one": a single student by e-mail.
 * The plain codes are returned once and are not stored.
 */
export async function POST(req: Request) {
  const session = await requireAdminApi(req);
  if (session instanceof Response) return session;
  const body = await req.json().catch(() => ({}));
  const mode = body.mode;

  const roster = await getCodeRoster();
  let targets: typeof roster;
  if (mode === "missing") targets = roster.filter((s) => !s.codeGeneratedAt);
  else if (mode === "all") targets = roster;
  else if (mode === "one" && typeof body.email === "string") {
    const email = normalizeEmail(body.email);
    targets = roster.filter((s) => s.email === email);
    if (targets.length === 0) return jsonError(404, "not_found", { message: "الطالب غير موجود في البيانات الحالية." });
  } else return jsonError(400, "invalid_request");

  try {
    const issued = await issueCodes(targets.map((t) => t.email));
    const codeByEmail = new Map(issued.map((i) => [i.email, i.code]));
    return jsonOk({
      codes: targets.map((t) => ({ name: t.name, email: t.email, classNo: t.classNo, code: codeByEmail.get(t.email)! })),
    });
  } catch (err) {
    console.error("code issue failed", err);
    return jsonError(500, "server_error", { message: "تعذّر توليد الرموز." });
  }
}
