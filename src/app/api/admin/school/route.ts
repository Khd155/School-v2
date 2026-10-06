import { requireAdminApi } from "@/lib/server/admin-auth";
import { sha256 } from "@/lib/server/crypto";
import { validateLogo } from "@/lib/server/images";
import { jsonError, jsonOk } from "@/lib/server/request";
import { LOGO_KINDS, updateSchoolSettings, type LogoChange, type SchoolSettings } from "@/lib/server/school";

const LIMITS: Record<keyof Omit<SchoolSettings, "enabledClasses">, number> = {
  schoolName: 120,
  educationOffice: 160,
  academicYear: 40,
  term: 60,
  subject: 80,
  grade: 40,
  teacherName: 80,
  footerText: 500,
};
const REQUIRED: (keyof SchoolSettings)[] = ["schoolName", "subject", "grade"];

const LOGO_ERRORS = {
  too_large: "حجم الشعار يتجاوز 1 ميجابايت.",
  unsupported: "صيغة الشعار غير مدعومة. الصيغ المقبولة: PNG أو WebP أو SVG.",
  invalid_svg: "ملف SVG غير صالح بعد إزالة المحتوى غير الآمن.",
};

export async function POST(req: Request) {
  const session = await requireAdminApi(req);
  if (session instanceof Response) return session;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError(400, "invalid_request", { message: "تعذّر استلام البيانات." });
  }

  const errors: Record<string, string> = {};
  const settings = {} as SchoolSettings;
  for (const [key, max] of Object.entries(LIMITS) as [keyof typeof LIMITS, number][]) {
    const raw = form.get(key);
    const value = typeof raw === "string" ? raw.replace(/\r\n/g, "\n").trim() : "";
    if (value.length > max) errors[key] = `الحد الأقصى ${max} حرفًا.`;
    if (REQUIRED.includes(key) && !value) errors[key] = "هذا الحقل مطلوب.";
    settings[key] = key === "footerText" ? value : value.replace(/\s+/g, " ");
  }

  const classesRaw = typeof form.get("enabledClasses") === "string" ? (form.get("enabledClasses") as string) : "";
  const classes = classesRaw
    .split(/[,،\s]+/)
    .filter(Boolean)
    .map((c) => Number(c.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))));
  if (classes.length === 0) errors.enabledClasses = "حدد فصلًا واحدًا على الأقل.";
  else if (classes.some((c) => !Number.isInteger(c) || c < 1 || c > 30)) errors.enabledClasses = "أرقام الفصول يجب أن تكون أعدادًا صحيحة بين 1 و30.";
  settings.enabledClasses = [...new Set(classes)].sort((a, b) => a - b);

  const logoChanges: LogoChange[] = [];
  for (const kind of LOGO_KINDS) {
    if (form.get(`${kind}Remove`) === "1") {
      logoChanges.push({ kind, action: "remove" });
      continue;
    }
    const file = form.get(`${kind}Logo`);
    if (file instanceof File && file.size > 0) {
      const result = validateLogo(Buffer.from(await file.arrayBuffer()));
      if (typeof result === "string") errors[`${kind}Logo`] = LOGO_ERRORS[result];
      else logoChanges.push({ kind, action: "replace", mime: result.mime, data: result.data, sha256: sha256(result.data) });
    }
  }

  if (Object.keys(errors).length > 0) return jsonError(400, "validation", { errors });

  try {
    const changed = await updateSchoolSettings(settings, logoChanges);
    return jsonOk({ changed });
  } catch (err) {
    console.error("school settings update failed", err);
    return jsonError(500, "server_error", { message: "تعذّر حفظ التعديلات." });
  }
}
