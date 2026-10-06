import { requireAdminApi } from "@/lib/server/admin-auth";
import { jsonError, jsonOk } from "@/lib/server/request";
import { getSchoolSettings } from "@/lib/server/school";
import { commitDraft } from "@/lib/server/students";

const MESSAGES = {
  not_found: "انتهت صلاحية المعاينة أو اعتُمدت مسبقًا. ارفع الملف مرة أخرى.",
  has_errors: "لا يمكن الاعتماد قبل إصلاح الأخطاء في الملف.",
  classes_changed: "تغيّرت الفصول المفعّلة بعد رفع الملف. ارفع الملف مرة أخرى.",
};

export async function POST(req: Request) {
  const session = await requireAdminApi(req);
  if (session instanceof Response) return session;
  const body = await req.json().catch(() => ({}));
  const draftId = typeof body.draftId === "string" && /^[0-9a-f-]{36}$/i.test(body.draftId) ? body.draftId : null;
  if (!draftId) return jsonError(400, "invalid_request");

  try {
    const settings = await getSchoolSettings();
    const result = await commitDraft(draftId, settings.enabledClasses);
    if (!result.ok) return jsonError(409, result.reason, { message: MESSAGES[result.reason] });
    return jsonOk(result);
  } catch (err) {
    console.error("import commit failed", err);
    return jsonError(500, "server_error", { message: "فشل الاعتماد، وبقيت البيانات السابقة كما هي." });
  }
}
