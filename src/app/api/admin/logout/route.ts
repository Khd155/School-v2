import { destroyAdminSession, requireAdminApi } from "@/lib/server/admin-auth";
import { jsonOk } from "@/lib/server/request";

export async function POST(req: Request) {
  const session = await requireAdminApi(req);
  if (session instanceof Response) return session;
  await destroyAdminSession();
  return jsonOk();
}
