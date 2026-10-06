import { requireAdminApi } from "@/lib/server/admin-auth";
import { jsonError, jsonOk } from "@/lib/server/request";
import { restoreVersion } from "@/lib/server/students";

export async function POST(req: Request) {
  const session = await requireAdminApi(req);
  if (session instanceof Response) return session;
  const body = await req.json().catch(() => ({}));
  const id = Number(body.datasetId);
  if (!Number.isSafeInteger(id) || id <= 0) return jsonError(400, "invalid_request");
  try {
    if (!(await restoreVersion(id))) return jsonError(404, "not_found", { message: "النسخة غير موجودة." });
    return jsonOk();
  } catch (err) {
    console.error("restore failed", err);
    return jsonError(500, "server_error", { message: "تعذّر الاسترجاع، وبقيت البيانات الحالية كما هي." });
  }
}
