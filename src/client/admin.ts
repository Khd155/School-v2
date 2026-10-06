import { formatAccessCode } from "../shared/access-code-format";
import { $, $$, NETWORK_ERROR, saveBlob, setBusy, showAlert } from "./dom";
import { adminPost, confirmAction } from "./admin-common";

const errorText = (status: number, message?: string, fallback = "تعذّر إكمال العملية.") => (status === 0 ? NETWORK_ERROR : message ?? fallback);

/* ---------------- Header ---------------- */

$("#logout")?.addEventListener("click", async (e) => {
  (e.currentTarget as HTMLButtonElement).disabled = true;
  await adminPost("/api/admin/logout", {});
  window.location.assign("/admin/login");
});

/* ---------------- Versions (data page) ---------------- */

for (const button of $$<HTMLButtonElement>("[data-restore]")) {
  button.addEventListener("click", () => {
    confirmAction({
      title: "استرجاع هذه النسخة؟",
      body: `ستصبح نسخة ${button.dataset.label} هي المنشورة لأولياء الأمور. تبقى النسخة الحالية محفوظة ويمكن الرجوع إليها.`,
      confirmLabel: "استرجاع ونشر",
      action: async () => {
        const res = await adminPost("/api/admin/versions/restore", { datasetId: Number(button.dataset.restore) });
        if (res.ok) {
          window.location.assign("/admin?done=restored");
          return true;
        }
        showAlert($("#versions-message"), "error", undefined, errorText(res.status, res.data.message, "تعذّر الاسترجاع."));
        return true;
      },
    });
  });
}

/* ---------------- Access codes ---------------- */

type IssuedCode = { name: string; email: string; classNo: number; code: string };
const codesRoot = $("#codes-root");

if (codesRoot) {
  const message = $("#codes-message");
  const issuedSection = $("#issued")!;
  const issuedBody = $("#issued-body")!;
  let issued: IssuedCode[] = [];

  const warnBeforeLeave = (e: BeforeUnloadEvent) => e.preventDefault();

  const markIssued = (codes: IssuedCode[]) => {
    const emails = new Set(codes.map((c) => c.email));
    for (const row of $$("#roster-body tr[data-email]")) {
      if (!emails.has(row.dataset.email!)) continue;
      const status = $("[data-status]", row)!;
      status.replaceChildren(Object.assign(document.createElement("span"), { className: "muted", textContent: "صدر الآن" }));
      const btn = $<HTMLButtonElement>("[data-regenerate]", row)!;
      btn.dataset.regenerate = "1";
      btn.textContent = "إعادة توليد";
    }
    const missing = $$("#roster-body [data-regenerate='0']").length;
    const total = $$("#roster-body tr[data-email]").length;
    $("#count-missing")!.textContent = String(missing);
    $("#count-with")!.textContent = String(total - missing);
    const genMissing = $<HTMLButtonElement>("#gen-missing")!;
    $(".btn-label", genMissing)!.textContent = `توليد رموز للطلاب بلا رمز (${missing})`;
    genMissing.disabled = missing === 0;
    $("#gen-all")!.dataset.with = String(total - missing);
  };

  const showIssued = (codes: IssuedCode[]) => {
    issued = codes;
    issuedBody.replaceChildren(
      ...codes.map((c) => {
        const tr = document.createElement("tr");
        const cell = (text: string, cls = "") => Object.assign(document.createElement("td"), { className: cls, textContent: text });
        const codeCell = cell("", "ltr nowrap");
        codeCell.append(Object.assign(document.createElement("span"), { className: "code-text", textContent: formatAccessCode(c.code) }));
        tr.append(cell(c.name, "nowrap"), cell(String(c.classNo), "num"), cell(c.email, "ltr nowrap"), codeCell);
        return tr;
      }),
    );
    $("#issued-title")!.textContent = `الرموز الجديدة (${codes.length})`;
    issuedSection.hidden = false;
    issuedSection.scrollIntoView({ behavior: "smooth", block: "start" });
    window.addEventListener("beforeunload", warnBeforeLeave);
    markIssued(codes);
  };

  async function generate(body: object): Promise<boolean> {
    showAlert(message, null);
    const res = await adminPost<{ codes: IssuedCode[] }>("/api/admin/codes", body);
    if (!res.ok) {
      showAlert(message, "error", undefined, errorText(res.status, res.data.message, "تعذّر توليد الرموز."));
      return true;
    }
    showIssued(res.data.codes);
    return true;
  }

  const genMissing = $<HTMLButtonElement>("#gen-missing");
  genMissing?.addEventListener("click", async () => {
    setBusy(genMissing, true);
    await generate({ mode: "missing" });
    setBusy(genMissing, false);
    genMissing.disabled = $$("#roster-body [data-regenerate='0']").length === 0;
  });

  $("#gen-all")?.addEventListener("click", (e) => {
    const n = (e.currentTarget as HTMLElement).dataset.with;
    confirmAction({
      title: "إعادة توليد رموز جميع الطلاب؟",
      body: `ستتوقف جميع الرموز الموزعة سابقًا (${n} رمزًا) عن العمل فورًا، وستحتاج إلى توزيع الرموز الجديدة على جميع أولياء الأمور.`,
      confirmLabel: "إعادة توليد الجميع",
      tone: "danger",
      action: () => generate({ mode: "all" }),
    });
  });

  $("#roster-body")?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-regenerate]");
    if (!btn) return;
    const row = btn.closest("tr")!;
    const had = btn.dataset.regenerate === "1";
    const body = document.createElement("span");
    body.append(had ? "سيتوقف الرمز السابق للطالب " : "سيصدر رمز للطالب ");
    body.append(Object.assign(document.createElement("strong"), { textContent: row.dataset.name! }));
    body.append(had ? " عن العمل فورًا." : ".");
    confirmAction({
      title: had ? "توليد رمز جديد لهذا الطالب؟" : "توليد رمز لهذا الطالب؟",
      body,
      confirmLabel: "توليد الرمز",
      action: () => generate({ mode: "one", email: row.dataset.email }),
    });
  });

  $("#hide-issued")?.addEventListener("click", () => {
    issuedSection.hidden = true;
    issuedBody.replaceChildren();
    issued = [];
    window.removeEventListener("beforeunload", warnBeforeLeave);
  });

  $("#download-csv")?.addEventListener("click", () => {
    const site = codesRoot.dataset.siteUrl ?? "";
    const rows = [["الطالب", "الفصل", "البريد المدرسي", "رمز الوصول", "رابط الاستعلام"], ...issued.map((c) => [c.name, String(c.classNo), c.email, c.code, site])];
    // ="..." keeps leading zeros in Excel; the BOM makes Excel read UTF-8 Arabic.
    const csv = rows.map((r, i) => r.map((v, j) => (i > 0 && j === 3 ? `="${v}"` : csvCell(v))).join(",")).join("\r\n");
    saveBlob(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }), `رموز الوصول - ${new Date().toISOString().slice(0, 10)}.csv`);
  });

  $("#print-slips")?.addEventListener("click", () => {
    const root = document.createElement("div");
    root.className = "slips-root";
    root.setAttribute("aria-hidden", "true");
    const grid = document.createElement("div");
    grid.className = "slips";
    const d = codesRoot.dataset;
    for (const c of issued) {
      const slip = document.createElement("div");
      slip.className = "slip";
      const p = (cls: string, text: string) => Object.assign(document.createElement("p"), { className: cls, textContent: text });
      const dl = document.createElement("dl");
      const pair = (k: string, v: string, code = false) => {
        const dt = Object.assign(document.createElement("dt"), { textContent: k });
        const dd = Object.assign(document.createElement("dd"), { className: "ltr" });
        if (code) dd.append(Object.assign(document.createElement("span"), { className: "code-text", textContent: v }));
        else dd.textContent = v;
        dl.append(dt, dd);
      };
      pair("البريد", c.email);
      pair("رمز الوصول", formatAccessCode(c.code), true);
      pair("الرابط", d.siteUrl ?? "");
      slip.append(
        p("slip-school", d.school ?? ""),
        p("slip-meta", `استعلام التحصيل — ${d.subject} — الصف ${d.grade}`),
        p("slip-name", `${c.name} — الفصل ${c.classNo}`),
        dl,
        p("slip-help", "افتح الرابط وأدخل البريد والرمز. احتفظ بالرمز ولا تشاركه."),
      );
      grid.append(slip);
    }
    root.append(grid);
    document.body.append(root);
    document.body.classList.add("printing-slips");
    const cleanup = () => {
      document.body.classList.remove("printing-slips");
      root.remove();
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
  });

  // Roster filters
  const search = $<HTMLInputElement>("#roster-search");
  const classFilter = $<HTMLSelectElement>("#roster-class");
  const applyFilter = () => {
    const q = search!.value.trim().toLowerCase();
    const cls = classFilter!.value;
    let shown = 0;
    for (const row of $$("#roster-body tr[data-email]")) {
      const match = (cls === "all" || row.dataset.class === cls) && (!q || row.dataset.name!.includes(q) || row.dataset.email!.includes(q));
      row.hidden = !match;
      if (match) shown++;
    }
    $("#roster-empty")!.hidden = shown > 0;
  };
  search?.addEventListener("input", applyFilter);
  classFilter?.addEventListener("change", applyFilter);
}

/** Quotes a CSV cell and neutralises spreadsheet formula injection. */
function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

/* ---------------- School info ---------------- */

const schoolForm = $<HTMLFormElement>("#school-form");
if (schoolForm) {
  const status = $("#form-status")!;
  const submit = $<HTMLButtonElement>("button[type=submit]", schoolForm)!;
  const MAX_LOGO = 1024 * 1024;
  const TYPES = ["image/png", "image/webp", "image/svg+xml"];
  type LogoState = { file: File | null; remove: boolean; url: string | null };
  const logoState: Record<string, LogoState> = {};

  const setStatus = (tone: "success" | "error" | null, text: string) => {
    status.className = `form-status${tone ? ` is-${tone}` : ""}`;
    status.textContent = text;
  };
  const clearErrors = () => {
    for (const el of $$("[data-error-for]", schoolForm)) {
      el.hidden = true;
      el.textContent = "";
    }
    for (const el of $$("[aria-invalid]", schoolForm)) el.removeAttribute("aria-invalid");
  };
  schoolForm.addEventListener("input", () => setStatus(null, "التعديلات لا تُطبّق قبل الحفظ."));

  for (const field of $$("[data-logo]", schoolForm)) {
    const kind = field.dataset.logo!;
    const current = field.dataset.current || null;
    const state: LogoState = (logoState[kind] = { file: null, remove: false, url: null });
    const preview = $(".logo-preview", field)!;
    const input = $<HTMLInputElement>("[data-logo-input]", field)!;
    const removeBtn = $<HTMLButtonElement>("[data-logo-remove]", field)!;
    const undoBtn = $<HTMLButtonElement>("[data-logo-undo]", field)!;
    const pending = $("[data-pending]", field)!;
    const error = $(`[data-error-for="${kind}Logo"]`, field)!;
    const label = field.querySelector(".label")!.firstChild!.textContent!.trim();

    const render = () => {
      const src = state.remove ? null : state.url ?? current;
      preview.replaceChildren(
        src
          ? Object.assign(document.createElement("img"), { src, alt: `معاينة ${label}` })
          : Object.assign(document.createElement("span"), { textContent: state.remove ? "سيُحذف عند الحفظ" : "لا يوجد شعار" }),
      );
      pending.hidden = !state.file;
      removeBtn.hidden = !(current || state.file) || state.remove;
      undoBtn.hidden = !(state.file || state.remove);
      $("[data-pick-label]", field)!.textContent = current || state.file ? "استبدال" : "رفع شعار";
    };
    const reset = () => {
      if (state.url) URL.revokeObjectURL(state.url);
      Object.assign(state, { file: null, remove: false, url: null });
      input.value = "";
      render();
    };

    input.addEventListener("change", () => {
      const file = input.files?.[0];
      error.hidden = true;
      if (!file) return;
      if (!TYPES.includes(file.type)) {
        error.textContent = "الصيغ المقبولة: PNG أو WebP أو SVG.";
        error.hidden = false;
        input.value = "";
        return;
      }
      if (file.size > MAX_LOGO) {
        error.textContent = "حجم الشعار يتجاوز 1 ميجابايت.";
        error.hidden = false;
        input.value = "";
        return;
      }
      if (state.url) URL.revokeObjectURL(state.url);
      Object.assign(state, { file, remove: false, url: URL.createObjectURL(file) });
      render();
      setStatus(null, "التعديلات لا تُطبّق قبل الحفظ.");
    });
    removeBtn.addEventListener("click", () => {
      if (state.url) URL.revokeObjectURL(state.url);
      Object.assign(state, { file: null, remove: true, url: null });
      input.value = "";
      render();
    });
    undoBtn.addEventListener("click", reset);
  }

  schoolForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearErrors();
    setBusy(submit, true, "جارٍ الحفظ…");
    const form = new FormData();
    for (const el of $$<HTMLInputElement | HTMLTextAreaElement>("input[name], textarea[name]", schoolForm)) form.append(el.name, el.value);
    for (const [kind, state] of Object.entries(logoState)) {
      if (state.remove) form.append(`${kind}Remove`, "1");
      else if (state.file) form.append(`${kind}Logo`, state.file);
    }
    const res = await adminPost<{ changed: boolean }>("/api/admin/school", form);
    setBusy(submit, false);
    if (!res.ok) {
      for (const [key, text] of Object.entries(res.data.errors ?? {})) {
        const el = $(`[data-error-for="${key}"]`, schoolForm);
        if (el) {
          el.textContent = text;
          el.hidden = false;
        }
        $(`#${key}`, schoolForm)?.setAttribute("aria-invalid", "true");
      }
      return setStatus("error", errorText(res.status, res.data.message, "تعذّر حفظ التعديلات."));
    }
    if (!res.data.changed) return setStatus("success", "لا توجد تعديلات للحفظ.");
    window.location.assign("/admin/school?saved=1");
  });

  if (new URLSearchParams(window.location.search).has("saved")) {
    setStatus("success", "حُفظت التعديلات وظهرت في الصفحة العامة والتقرير.");
    history.replaceState(null, "", "/admin/school");
  }
}

/* ---------------- Account ---------------- */

const passwordForm = $<HTMLFormElement>("#password-form");
if (passwordForm) {
  const message = $("#form-message", passwordForm);
  const submit = $<HTMLButtonElement>("button[type=submit]", passwordForm)!;
  passwordForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const current = $<HTMLInputElement>("#pw-current")!.value;
    const next = $<HTMLInputElement>("#pw-next")!.value;
    const confirm = $<HTMLInputElement>("#pw-confirm")!.value;
    if (next.length < 12) return showAlert(message, "error", undefined, "كلمة المرور الجديدة يجب ألا تقل عن 12 حرفًا.");
    if (next !== confirm) return showAlert(message, "error", undefined, "تأكيد كلمة المرور لا يطابق كلمة المرور الجديدة.");
    setBusy(submit, true);
    const res = await adminPost("/api/admin/password", { current, next });
    setBusy(submit, false);
    if (!res.ok) {
      return showAlert(message, "error", undefined, res.data.error === "wrong_current" ? "كلمة المرور الحالية غير صحيحة." : errorText(res.status, res.data.message, "تعذّر تغيير كلمة المرور."));
    }
    passwordForm.reset();
    showAlert(message, "success", undefined, "تم تغيير كلمة المرور.");
  });
}
