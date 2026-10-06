import ExcelJS from "exceljs";
import { extractGrid } from "../shared/import/grid";
import { $, $$, NETWORK_ERROR, setBusy, showAlert } from "./dom";
import { adminPost, confirmAction } from "./admin-common";

/**
 * The workbook is read here, in the teacher's browser, and sent as a plain cell
 * grid. The server re-validates the grid as untrusted input; this keeps the
 * Worker's CPU time per request small.
 */
const MAX_BYTES = 4 * 1024 * 1024;
const ZIP = [0x50, 0x4b, 0x03, 0x04];

const input = $<HTMLInputElement>("#import-file")!;
const fileName = $("#import-file-name")!;
const upload = $<HTMLButtonElement>("#import-upload")!;
const message = $("#import-message");
const preview = $("#import-preview")!;
let draftId: string | null = null;

input.addEventListener("change", () => {
  const file = input.files?.[0] ?? null;
  showAlert(message, null);
  fileName.textContent = file ? file.name : "لم يُختر ملف";
  fileName.classList.toggle("has-file", !!file);
  let error: string | null = null;
  if (file && !/\.xlsx$/i.test(file.name)) error = "اختر ملفًا بصيغة ‎.xlsx‎.";
  else if (file && file.size > MAX_BYTES) error = "حجم الملف يتجاوز 4 ميجابايت.";
  if (error) {
    showAlert(message, "error", undefined, error);
    input.value = "";
    fileName.textContent = "لم يُختر ملف";
    fileName.classList.remove("has-file");
  }
  upload.disabled = !input.files?.[0];
});

async function discard() {
  if (draftId) void adminPost("/api/admin/import/discard", { draftId });
  draftId = null;
  preview.replaceChildren();
}

upload.addEventListener("click", async () => {
  const file = input.files?.[0];
  if (!file) return;
  setBusy(upload, true, "جارٍ الفحص…");
  showAlert(message, null);
  await discard();

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!ZIP.every((b, i) => bytes[i] === b)) throw new Error("not-xlsx");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes.buffer);
    const sheets = extractGrid(workbook);
    const res = await adminPost<{ draftId: string; html: string }>("/api/admin/import", { filename: file.name, sheets });
    if (!res.ok) {
      showAlert(message, "error", undefined, res.status === 0 ? NETWORK_ERROR : res.data.message ?? "تعذّرت معالجة الملف.");
      return;
    }
    draftId = res.data.draftId;
    // Server-rendered (escaped) preview fragment from our own origin.
    preview.innerHTML = res.data.html;
    bindPreview();
  } catch {
    showAlert(message, "error", undefined, "تعذّرت قراءة الملف. تأكد أنه ملف Excel بصيغة ‎.xlsx‎ وغير محمي بكلمة مرور.");
  } finally {
    setBusy(upload, false);
  }
});

function bindPreview() {
  for (const toggle of $$<HTMLButtonElement>("[data-toggle-issues]", preview)) {
    toggle.addEventListener("click", () => {
      const expanded = toggle.getAttribute("aria-expanded") === "true";
      for (const li of $$("[data-extra]", toggle.closest(".issues")!)) li.hidden = expanded;
      toggle.setAttribute("aria-expanded", String(!expanded));
      toggle.textContent = expanded ? toggle.dataset.more ?? toggle.textContent : "عرض أقل";
    });
    toggle.dataset.more = toggle.textContent ?? "";
  }

  $("#import-cancel", preview)?.addEventListener("click", async () => {
    await discard();
    input.value = "";
    fileName.textContent = "لم يُختر ملف";
    fileName.classList.remove("has-file");
    upload.disabled = true;
  });

  $("#import-commit", preview)?.addEventListener("click", () => {
    const count = preview.querySelector<HTMLElement>("[data-student-count]")?.dataset.studentCount ?? "0";
    const current = upload.dataset.currentCount;
    confirmAction({
      title: "اعتماد البيانات الجديدة؟",
      body: current
        ? `ستحل بيانات ${count} طالبًا محل البيانات المنشورة حاليًا (${current} طالبًا). يُحفظ الإصدار الحالي ويمكن استرجاعه لاحقًا.`
        : `ستُنشر بيانات ${count} طالبًا لأولياء الأمور.`,
      confirmLabel: "اعتماد ونشر",
      action: async () => {
        const res = await adminPost("/api/admin/import/commit", { draftId });
        if (res.ok) {
          window.location.assign("/admin?done=committed");
          return false;
        }
        showAlert(message, "error", undefined, res.status === 0 ? NETWORK_ERROR : res.data.message ?? "فشل الاعتماد، وبقيت البيانات السابقة كما هي.");
        return true;
      },
    });
  });
}
