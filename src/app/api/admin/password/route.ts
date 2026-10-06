import { changeAdminPassword, MIN_PASSWORD_LENGTH, requireAdminApi } from "@/lib/server/admin-auth";
import { jsonError, jsonOk } from "@/lib/server/request";

export async function POST(req: Request) {
  const session = await requireAdminApi(req);
  if (session instanceof Response) return session;

  const body = await req.json().catch(() => ({}));
  const current = typeof body.current === "string" ? body.current : "";
  const next = typeof body.next === "string" ? body.next : "";
  if (next.length < MIN_PASSWORD_LENGTH || next.length > 200) return jsonError(400, "weak_password");

  const result = await changeAdminPassword(session, current, next);
  if (result === "wrong_current") return jsonError(400, "wrong_current");
  return jsonOk();
}
