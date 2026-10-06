import { isValidEmail, normalizeAccessCode, normalizeEmail } from "../shared/access-code-format";
import { $, minutesLabel, NETWORK_ERROR, post, setBusy, showAlert } from "./dom";

const form = $<HTMLFormElement>("#lookup-form")!;
const email = $<HTMLInputElement>("#email")!;
/** Absent when the teacher has turned access codes off. */
const code = $<HTMLInputElement>("#code");
const submit = $<HTMLButtonElement>("button[type=submit]", form)!;
const message = $("#form-message")!;

function fieldError(input: HTMLInputElement, text: string | null) {
  const el = $(`#${input.id}-error`)!;
  el.textContent = text ?? "";
  el.hidden = !text;
  input.setAttribute("aria-invalid", String(!!text));
  const hint = input.id === "code" ? " code-hint" : "";
  if (text) input.setAttribute("aria-describedby", `${input.id}-error${hint}`);
  else if (hint) input.setAttribute("aria-describedby", "code-hint");
  else input.removeAttribute("aria-describedby");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (submit.disabled) return;

  const e = normalizeEmail(email.value);
  const c = code ? normalizeAccessCode(code.value) : null;
  const emailErr = !e ? "أدخل البريد المدرسي للطالب." : !isValidEmail(e) ? "صيغة البريد غير صحيحة. مثال: name@school.edu.sa" : null;
  const codeErr = !code ? null : !code.value.trim() ? "أدخل رمز الوصول." : !c ? "رمز الوصول مكوّن من 8 أرقام." : null;
  fieldError(email, emailErr);
  if (code) fieldError(code, codeErr);
  showAlert(message, null);
  if (emailErr) return email.focus();
  if (codeErr) return code?.focus();

  setBusy(submit, true, "جارٍ الاستعلام…");
  form.setAttribute("aria-busy", "true");
  const res = await post<{ ok: boolean }>("/api/lookup", code ? { email: e, code: c } : { email: e });
  if (res.ok) {
    window.location.assign("/report");
    return; // keep the busy state while navigating
  }
  setBusy(submit, false);
  form.removeAttribute("aria-busy");

  switch (res.status) {
    case 401:
      return showAlert(message, "error", "تعذّر التحقق", "البريد أو رمز الوصول غير صحيح. تأكد منهما ثم حاول مرة أخرى.");
    case 404:
      if (res.data.error === "email_not_found") {
        return showAlert(message, "error", "لا توجد نتيجة", "لم نجد طالبًا بهذا البريد. تأكد من كتابته كما هو في حساب الطالب المدرسي.");
      }
      return showAlert(message, "error", "لا توجد نتيجة", "تم التحقق بنجاح، لكن لا توجد نتيجة مسجلة لهذا الطالب حاليًا. تواصل مع معلم المادة.");
    case 429:
      return showAlert(
        message,
        "error",
        "تجاوزت عدد المحاولات",
        `لحماية بيانات الطلاب أُوقفت المحاولات مؤقتًا. حاول مرة أخرى بعد ${minutesLabel(res.data.retryAfterMinutes ?? 15)}.`,
      );
    case 400:
      return showAlert(message, "error", "بيانات غير مكتملة", "تحقق من البريد ورمز الوصول ثم حاول مرة أخرى.");
    case 0:
      return showAlert(message, "error", "تعذّر الاتصال", NETWORK_ERROR);
    default:
      return showAlert(message, "error", "حدث خطأ غير متوقع", "تعذّر إكمال الطلب الآن. حاول مرة أخرى بعد قليل.");
  }
});
