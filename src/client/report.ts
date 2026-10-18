import { $, post, saveBlob, setBusy, showAlert } from "./dom";

const message = $("#report-message");

$("#print-report")?.addEventListener("click", () => window.print());

$("#new-lookup")?.addEventListener("click", async (e) => {
  (e.currentTarget as HTMLButtonElement).disabled = true;
  await post("/api/report/logout", {});
  window.location.replace("/");
});

/* Teacher view: the parent-signature box can be switched off; the choice is remembered on this device. */
const SIGNATURE_PREF = "report-signature";
const signatureToggle = $<HTMLInputElement>("#toggle-signature");
const signatureBox = $("[data-signature]");
if (signatureToggle && signatureBox) {
  try {
    if (localStorage.getItem(SIGNATURE_PREF) === "0") signatureToggle.checked = false;
  } catch {
    /* storage unavailable: keep the default */
  }
  const apply = () => {
    signatureBox.hidden = !signatureToggle.checked;
    try {
      localStorage.setItem(SIGNATURE_PREF, signatureToggle.checked ? "1" : "0");
    } catch {
      /* ignore */
    }
  };
  signatureToggle.addEventListener("change", apply);
  apply();
}

const pdfButton = $<HTMLButtonElement>("#download-pdf");
pdfButton?.addEventListener("click", async () => {
  setBusy(pdfButton, true, "جارٍ التجهيز…");
  showAlert(message, null);
  try {
    // Parents use their session endpoint; the teacher's view passes a per-student URL.
    const url = new URL(pdfButton.dataset.pdfUrl ?? "/api/report/pdf", window.location.href);
    if (signatureToggle?.checked) url.searchParams.set("signature", "1");
    const res = await fetch(url, { cache: "no-store", credentials: "same-origin" });
    if (res.status === 401) return window.location.replace(pdfButton.dataset.expiredUrl ?? "/");
    if (!res.ok) throw new Error(String(res.status));
    saveBlob(await res.blob(), filenameFrom(res.headers.get("Content-Disposition")) ?? "تقرير التحصيل.pdf");
  } catch {
    showAlert(
      message,
      "error",
      "تعذّر إنشاء ملف PDF الآن",
      "حاول مرة أخرى بعد قليل، أو استخدم «طباعة التقرير» ثم اختر «حفظ بتنسيق PDF» من قائمة الطابعة.",
    );
  } finally {
    setBusy(pdfButton, false);
  }
});

function filenameFrom(header: string | null): string | null {
  const match = header?.match(/filename\*=UTF-8''([^;]+)/i);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}
