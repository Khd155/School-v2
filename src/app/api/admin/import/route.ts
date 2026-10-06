import { requireAdminApi } from "@/lib/server/admin-auth";
import { jsonError, jsonOk } from "@/lib/server/request";
import { getSchoolSettings } from "@/lib/server/school";
import { saveDraft } from "@/lib/server/students";
import { ImportFileError, parseWorkbook } from "@/lib/import/parse";

export const maxDuration = 30;

// Vercel caps request bodies at 4.5 MB.
const MAX_BYTES = 4 * 1024 * 1024;
const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];

/** Parses an uploaded workbook into a draft for preview. Nothing live changes here. */
export async function POST(req: Request) {
  const session = await requireAdminApi(req);
  if (session instanceof Response) return session;

  let file: File | null = null;
  try {
    const form = await req.formData();
    const value = form.get("file");
    file = value instanceof File ? value : null;
  } catch {
    return jsonError(400, "invalid_request", { message: "تعذّر استلام الملف." });
  }
  if (!file) return jsonError(400, "invalid_request", { message: "اختر ملف Excel أولًا." });
  if (file.size > MAX_BYTES) return jsonError(400, "too_large", { message: "حجم الملف يتجاوز 4 ميجابايت." });
  if (!/\.xlsx$/i.test(file.name)) return jsonError(400, "bad_type", { message: "الملف يجب أن يكون بصيغة ‎.xlsx‎." });

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!ZIP_SIGNATURE.every((b, i) => buffer[i] === b)) {
    return jsonError(400, "bad_type", { message: "محتوى الملف ليس ملف Excel صالحًا (‎.xlsx‎)." });
  }

  try {
    const settings = await getSchoolSettings();
    const result = await parseWorkbook(buffer, settings.enabledClasses);
    const filename = file.name.slice(0, 200);
    const draftId = await saveDraft({ ...result, filename, enabledClasses: settings.enabledClasses });
    return jsonOk({ draftId, filename, ...result });
  } catch (err) {
    if (err instanceof ImportFileError) return jsonError(400, "parse_failed", { message: err.message });
    console.error("import parse failed", err);
    return jsonError(500, "server_error", { message: "تعذّرت معالجة الملف." });
  }
}
