import { $, minutesLabel, NETWORK_ERROR, post, setBusy, showAlert } from "./dom";

const form = $<HTMLFormElement>("#login-form")!;
const password = $<HTMLInputElement>("#password")!;
const submit = $<HTMLButtonElement>("button[type=submit]", form)!;
const message = $("#form-message")!;

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!password.value) {
    password.setAttribute("aria-invalid", "true");
    return showAlert(message, "error", undefined, "أدخل كلمة المرور.");
  }
  setBusy(submit, true, "جارٍ الدخول…");
  showAlert(message, null);
  const res = await post("/api/admin/login", { password: password.value });
  if (res.ok) return window.location.assign("/admin");
  setBusy(submit, false);
  password.setAttribute("aria-invalid", "true");
  if (res.status === 401) showAlert(message, "error", undefined, "كلمة المرور غير صحيحة.");
  else if (res.status === 429) showAlert(message, "error", undefined, `تجاوزت عدد المحاولات. حاول بعد ${minutesLabel(res.data.retryAfterMinutes ?? 15)}.`);
  else if (res.status === 0) showAlert(message, "error", undefined, NETWORK_ERROR);
  else showAlert(message, "error", undefined, "تعذّر تسجيل الدخول الآن. حاول مرة أخرى.");
});
