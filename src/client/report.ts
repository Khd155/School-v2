import { $, post, saveBlob, setBusy, showAlert } from "./dom";

const message = $("#report-message");

$("#print-report")?.addEventListener("click", () => window.print());

$("#new-lookup")?.addEventListener("click", async (e) => {
  (e.currentTarget as HTMLButtonElement).disabled = true;
  await post("/api/report/logout", {});
  window.location.replace("/");
});

const pdfButton = $<HTMLButtonElement>("#download-pdf");
pdfButton?.addEventListener("click", async () => {
  setBusy(pdfButton, true, "جارٍ التجهيز…");
  showAlert(message, null);
  try {
    const res = await fetch("/api/report/pdf", { cache: "no-store", credentials: "same-origin" });
    if (res.status === 401) return window.location.replace("/");
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
