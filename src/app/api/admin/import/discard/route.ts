import { requireAdminApi } from "@/lib/server/admin-auth";
import { jsonError, jsonOk } from "@/lib/server/request";
import { discardDraft } from "@/lib/server/students";

export async function POST(req: Request) {
  const session = await requireAdminApi(req);
  if (session instanceof Response) return session;
  const body = await req.json().catch(() => ({}));
  if (typeof body.draftId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.draftId)) return jsonError(400, "invalid_request");
  await discardDraft(body.draftId);
  return jsonOk();
}
