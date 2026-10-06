// End-to-end smoke test against `wrangler dev` with its LOCAL D1 database (it is wiped first).
// Usage: BASE_URL=http://127.0.0.1:8787 ADMIN_PASSWORD=... CHROMIUM_PATH=/path/to/chrome \
//        [SKIP_PDF=1] [SHOTS_DIR=...] node tests/e2e/smoke.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:8787";
const PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const SHOTS = process.env.SHOTS_DIR;
const fixtures = path.join(process.cwd(), "tests", "fixtures");

if (!/^http:\/\/(localhost|127\.0\.0\.1)/.test(BASE)) throw new Error("Refusing to run against a non-local server");

/** Runs SQL on the local D1 database (never --remote). */
function sql(query) {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", "school-grades", "--local", "--json", "--command", query], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return JSON.parse(out.slice(out.indexOf("[")))[0].results;
}

sql(`DELETE FROM students; DELETE FROM class_stats; UPDATE app_state SET active_dataset_id = NULL, data_updated_at = NULL; DELETE FROM datasets;
     DELETE FROM import_drafts; DELETE FROM access_codes; DELETE FROM admin_credentials; DELETE FROM admin_sessions; DELETE FROM rate_limits;
     DELETE FROM settings_log; DELETE FROM logos; DELETE FROM lookup_log;
     UPDATE app_settings SET school_name = 'مدرسة عبدالرحمن بن أبي بكر الابتدائية', education_office = '', academic_year = '', term = '',
       subject = 'الدراسات الإسلامية', grade = 'السادس', enabled_classes = '[4,5,6]', teacher_name = '', footer_text = '', require_access_code = 1;`);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const shot = async (page, name) => {
  if (!SHOTS) return;
  await mkdir(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
};
const step = (msg) => console.log(`✓ ${msg}`);

try {
  /* ---------- Public page before any data ---------- */
  const parent = await browser.newPage({ viewport: { width: 375, height: 800 } });
  await parent.goto(BASE);
  await parent.getByText("لم تُنشر النتائج بعد").waitFor();
  assert.equal(await parent.locator("img").count(), 0, "no logos before upload");
  step("public page shows the not-published state");

  /* ---------- Teacher login ---------- */
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const admin = await ctx.newPage();
  await admin.goto(`${BASE}/admin`);
  await admin.waitForURL(/\/admin\/login$/);
  await admin.fill("#password", "wrong-password-123");
  await admin.click("button[type=submit]");
  await admin.getByText("كلمة المرور غير صحيحة").waitFor();
  await admin.fill("#password", PASSWORD);
  await admin.click("button[type=submit]");
  await admin.waitForURL(`${BASE}/admin`);
  step("teacher login rejects a wrong password and accepts the right one");
  const [cred] = sql("SELECT password_hash FROM admin_credentials");
  assert.match(cred.password_hash, /^pbkdf2\$/, "password stored hashed");

  /* ---------- API protection ---------- */
  const anon = await fetch(`${BASE}/api/admin/codes`, { method: "POST", headers: { origin: BASE, "content-type": "application/json" }, body: '{"mode":"all"}' });
  assert.equal(anon.status, 401);
  const cookies = await ctx.cookies();
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  const noCsrf = await fetch(`${BASE}/api/admin/codes`, { method: "POST", headers: { origin: BASE, cookie: cookieHeader, "content-type": "application/json" }, body: '{"mode":"all"}' });
  assert.equal(noCsrf.status, 403, "CSRF token required");
  const crossSite = await fetch(`${BASE}/api/admin/codes`, { method: "POST", headers: { origin: "https://evil.example", cookie: cookieHeader }, body: "{}" });
  assert.equal(crossSite.status, 403, "cross-origin rejected");
  step("admin API requires session, same origin and CSRF token");

  /* ---------- Import: invalid file ---------- */
  await admin.setInputFiles("input[type=file]", path.join(fixtures, "invalid.xlsx"));
  await admin.click("text=رفع ومعاينة");
  await admin.getByText("لا يمكن اعتماد الملف").waitFor();
  assert.ok(await admin.getByText(/الفصل 7 غير مفعّل/).isVisible());
  assert.ok(await admin.getByRole("button", { name: "اعتماد البيانات" }).isDisabled());
  await shot(admin, "admin-import-errors");
  step("invalid workbook shows row-numbered errors and blocks approval");

  /* ---------- Import: valid file ---------- */
  await admin.setInputFiles("input[type=file]", path.join(fixtures, "valid.xlsx"));
  await admin.click("text=رفع ومعاينة");
  await admin.getByText("الملف صالح للاعتماد مع تنبيهات").waitFor();
  await shot(admin, "admin-import-preview");
  await admin.click("text=اعتماد البيانات");
  await admin.click("dialog >> text=اعتماد ونشر");
  await admin.getByText("اعتُمدت البيانات الجديدة وأصبحت منشورة لأولياء الأمور.").waitFor();
  const [state1] = sql("SELECT data_updated_at, active_dataset_id FROM app_state");
  assert.ok(state1.data_updated_at);
  await shot(admin, "admin-data");
  step("valid workbook previews with warnings and commits");

  /* ---------- Grade analysis ---------- */
  await admin.goto(`${BASE}/admin/grades`);
  const firstRank = await admin.locator("tbody tr").first().locator("td").allInnerTexts();
  assert.equal(firstRank[1].trim(), "محمد تجربة 2", "lowest final total first");
  assert.equal(firstRank[4].trim(), "0", "zero is ranked, not skipped");
  assert.ok((await admin.locator("#grades-title").locator("xpath=..").innerText()).includes("2 غير مسجل"), "empty and text values counted separately");
  await admin.goto(`${BASE}/admin/grades?field=homework&class=5&order=desc&limit=all`);
  const hw = (await admin.locator("tbody td.grade-cell-value").allInnerTexts()).map(Number);
  assert.equal(hw.length, 8, "all 8 students of class 5");
  assert.deepEqual([...hw].sort((a, b) => b - a), hw, "sorted highest first");
  const below = await admin.evaluate(async () => (await fetch("/admin/grades.csv?field=finalTotal&below=60&limit=all")).text());
  assert.ok(below.includes("المجموع النهائي") && !/,"6\d"\s*$/m.test(below), "CSV export respects the threshold");
  await shot(admin, "admin-grades");
  step("grade analysis ranks by any grade, per class, with threshold and CSV");

  /* ---------- Access codes ---------- */
  await admin.goto(`${BASE}/admin/codes`);
  await admin.click("text=توليد رموز للطلاب بلا رمز (24)");
  await admin.getByText("الرموز الجديدة (24)").waitFor();
  const firstRow = admin.locator("#issued-title").locator("xpath=ancestor::section").locator("tbody tr").first();
  const email = (await firstRow.locator("td").nth(2).innerText()).trim();
  const code = (await firstRow.locator("td").nth(3).innerText()).replace(/\s/g, "");
  assert.match(code, /^\d{8}$/);
  const [row] = sql(`SELECT code_hash FROM access_codes WHERE email = '${email}'`);
  assert.ok(/^[0-9a-f]{64}$/.test(row.code_hash) && !row.code_hash.includes(code), "code stored hashed");
  await shot(admin, "admin-codes");
  step(`codes issued once and stored hashed (${email})`);

  /* ---------- School info + logos ---------- */
  await admin.goto(`${BASE}/admin/school`);
  await admin.fill("#educationOffice", "إدارة تعليم تجريبية");
  await admin.fill("#academicYear", "1448هـ");
  await admin.fill("#term", "الفصل الدراسي الأول");
  await admin.fill("#teacherName", "معلم تجريبي");
  await admin.fill("#footerText", "نص تذييل تجريبي.");
  const fileInputs = admin.locator("input[type=file]");
  await fileInputs.nth(0).setInputFiles(path.join(fixtures, "logo-test.png"));
  await fileInputs.nth(1).setInputFiles(path.join(fixtures, "logo-unsafe.svg"));
  await admin.click("text=حفظ التعديلات");
  await admin.getByText("حُفظت التعديلات").waitFor();
  const [svg] = sql("SELECT CAST(data AS TEXT) AS data FROM logos WHERE kind = 'school'");
  const svgText = svg.data;
  assert.ok(!/script|onload|javascript:|foreignObject|evil\.example/i.test(svgText), `SVG sanitised: ${svgText}`);
  assert.ok(svgText.includes("<rect"), "SVG keeps safe shapes");
  const [state2] = sql("SELECT data_updated_at FROM app_state");
  assert.equal(state2.data_updated_at, state1.data_updated_at, "settings do not touch data_updated_at");
  await admin.getByText(/تعديل: .*إدارة التعليم/).waitFor();
  await shot(admin, "admin-school");
  step("school info saved, SVG sanitised, last-data-update unchanged, change logged");

  // Fake PNG (wrong magic bytes) is rejected server-side.
  await fileInputs.nth(0).setInputFiles({ name: "fake.png", mimeType: "image/png", buffer: Buffer.from("<html>not an image</html>") });
  await admin.click("text=حفظ التعديلات");
  await admin.getByText(/صيغة الشعار غير مدعومة/).waitFor();
  step("logo type checked on real bytes, not the extension");

  /* ---------- Parent lookup ---------- */
  await parent.goto(BASE);
  await parent.locator(".site-header-logos img").first().waitFor();
  assert.equal(await parent.locator(".site-header-logos img").count(), 2);
  assert.ok(!(await parent.locator(".lookup-facts").innerText()).includes("الفصول"), "classes are not listed on the lookup page");
  await parent.click("text=عرض التقرير");
  await parent.getByText("أدخل البريد المدرسي للطالب.").waitFor();
  await parent.fill("#email", "not-an-email");
  await parent.fill("#code", "123");
  await parent.click("text=عرض التقرير");
  await parent.getByText(/صيغة البريد غير صحيحة/).waitFor();
  await shot(parent, "lookup-validation");

  await parent.fill("#email", email);
  await parent.fill("#code", code.split("").reverse().join("") === code ? "00000000" : code.split("").reverse().join(""));
  await parent.click("text=عرض التقرير");
  await parent.getByText("البريد أو رمز الوصول غير صحيح").waitFor();
  await parent.fill("#email", "nobody@test.school.example");
  await parent.click("text=عرض التقرير");
  await parent.getByText("البريد أو رمز الوصول غير صحيح").waitFor();
  step("wrong code and unknown e-mail give the identical message");

  await parent.fill("#email", email.toUpperCase());
  await parent.fill("#code", `${code.slice(0, 4)} ${code.slice(4)}`);
  await parent.click("text=عرض التقرير");
  await parent.waitForURL(`${BASE}/report`);
  await parent.getByText("تقرير التحصيل الدراسي").waitFor();
  await parent.locator(".masthead-logos img").first().waitFor();
  await shot(parent, "report-mobile");
  step("correct e-mail + code opens the report");

  // Report content checks for this student (first student of class 4 in the fixture).
  const report = parent.locator(".report");
  const text = await report.innerText();
  for (const label of ["الواجبات", "المشاركة والتفاعل", "المهام الأدائية", "مجموع أعمال الفصل", "القرآن الكريم", "الاختبارات", "مجموع القرآن والاختبارات", "تسميع سورة القلم", "تسميع الأحاديث — المهام الأدائية", "إدارة تعليم تجريبية", "معلم تجريبي", "نص تذييل تجريبي."]) {
    assert.ok(text.includes(label), `report contains ${label}`);
  }
  const [stats] = sql("SELECT cs.average, cs.highest FROM class_stats cs JOIN app_state st ON st.active_dataset_id = cs.dataset_id WHERE cs.class_no = 4");
  const avgText = await parent.locator(".summary-stats dd").first().innerText();
  assert.equal(avgText, String(Math.round(Number(stats.average) * 100) / 100));
  assert.equal(await parent.locator(".summary-stats dd").nth(1).innerText(), String(Number(stats.highest)));
  assert.ok(!text.includes("student402"), "no other student data");

  // Order of grade cells: first row right-to-left = homework, participation, performance.
  const rowLabels = await parent.locator(".grade-row-3 .grade-label").allInnerTexts();
  assert.deepEqual(rowLabels, ["الواجبات", "المشاركة والتفاعل", "المهام الأدائية"]);
  const boxes = await Promise.all((await parent.locator(".grade-row-3 .grade-cell").all()).map((l) => l.boundingBox()));
  assert.ok(boxes[0].x > boxes[1].x && boxes[1].x > boxes[2].x, "first cell is on the right");
  const total = await parent.locator(".grade-row-total .grade-cell").first().boundingBox();
  const rowCenter = (boxes[0].x + boxes[0].width + boxes[2].x) / 2;
  assert.ok(Math.abs(total.x + total.width / 2 - rowCenter) < 2, "total centred");
  // Recitation colours, derived the same way the fixture generator sets them.
  const idx = Number(email.match(/^student\d(\d\d)@/)[1]) - 1;
  const expected = ["done", idx % 2 ? "done" : "not-done", idx % 3 ? "done" : "empty", idx % 5 ? "not-done" : "empty"];
  const classes = await parent.locator(".recitations-4 .recitation").evaluateAll((els) => els.map((e) => e.className));
  assert.deepEqual(classes, expected.map((t) => `recitation is-${t}`));
  const statusTexts = await parent.locator(".recitations-4 .recitation-status").allInnerTexts();
  assert.deepEqual(statusTexts.map((t) => t.trim()), expected.map((t) => ({ done: "تم", "not-done": "لم يتم", empty: "غير مسجل" })[t]));
  step("report values, class stats, layout order and recitation states verified");

  // No horizontal overflow on mobile.
  assert.equal(await parent.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "no overflow at 375px");

  // PDF download (Browser Rendering is only available when deployed or with remote bindings).
  if (!process.env.SKIP_PDF) {
  const pdfRes = await parent.request.get(`${BASE}/api/report/pdf`);
  assert.equal(pdfRes.status(), 200);
  assert.equal(pdfRes.headers()["content-type"], "application/pdf");
  const pdf = await pdfRes.body();
  assert.ok(pdf.subarray(0, 5).toString() === "%PDF-" && pdf.length > 20_000, `pdf size ${pdf.length}`);
  if (SHOTS) await (await import("node:fs/promises")).writeFile(path.join(SHOTS, "report.pdf"), pdf);
  step(`PDF generated (${Math.round(pdf.length / 1024)} KB)`);
  }

  // Print stylesheet hides toolbar.
  await parent.emulateMedia({ media: "print" });
  assert.equal(await parent.locator(".report-toolbar").isVisible(), false);
  await parent.emulateMedia({ media: "screen" });
  step("print view hides controls");

  // "New lookup" clears the session.
  await parent.click("text=استعلام جديد");
  await parent.waitForURL(`${BASE}/`);
  await parent.goto(`${BASE}/report`);
  await parent.waitForURL(`${BASE}/`);
  const anonPdf = await fetch(`${BASE}/api/report/pdf`);
  assert.equal(anonPdf.status, 401);
  step("logout clears the report session; PDF requires a session");

  /* ---------- Rate limiting ---------- */
  const target = "student501@test.school.example";
  let last;
  for (let i = 0; i < 6; i++) {
    last = await fetch(`${BASE}/api/lookup`, { method: "POST", headers: { origin: BASE, "content-type": "application/json", "x-real-ip": `10.0.0.${i}` }, body: JSON.stringify({ email: target, code: "00000000" }) });
  }
  assert.equal(last.status, 429, "per-email limit");
  const body429 = await last.json();
  assert.ok(body429.retryAfterMinutes >= 1);
  step("per-email rate limit triggers after 5 attempts");

  /* ---------- Search log ---------- */
  await admin.goto(`${BASE}/admin/log`);
  const logText = await admin.locator("section[aria-labelledby=log-title] table").innerText();
  for (const label of ["عُرض التقرير", "رمز وصول خاطئ", "بريد غير موجود", "أُوقف لكثرة المحاولات"]) {
    assert.ok(logText.includes(label), `log shows «${label}»`);
  }
  assert.ok(logText.includes(email) && logText.includes("nobody@test.school.example"), "log shows searched e-mails");
  await admin.selectOption("#log-outcome", "success");
  await admin.click("form[role=search] button[type=submit]");
  await admin.waitForURL(/outcome=success/);
  const outcomes = await admin.locator("tbody .outcome").allInnerTexts();
  assert.ok(outcomes.length > 0 && outcomes.every((o) => o === "عُرض التقرير"), "outcome filter works");
  await admin.goto(`${BASE}/admin/log`);
  const statsText = await admin.locator(".stats-grid").innerText();
  assert.ok(/الفصل 4\s+8\s+1\s+7/.test(statsText), "class 4: 8 students, 1 viewed, 7 not yet");
  assert.ok(statsText.includes("النشاط اليومي"), "daily activity shown");
  // Fetched from inside the page so the browser sends its Secure/SameSite cookie, like a real click.
  const { csv, type } = await admin.evaluate(async () => {
    const r = await fetch("/admin/log.csv");
    return { type: r.headers.get("content-type"), csv: new TextDecoder("utf-8", { ignoreBOM: true }).decode(await r.arrayBuffer()) };
  });
  assert.equal(type, "text/csv; charset=utf-8");
  assert.ok(csv.startsWith("\uFEFF") && csv.includes("عُرض التقرير") && csv.includes("رمز وصول خاطئ"), "CSV export");
  assert.equal((await fetch(`${BASE}/admin/log.csv`, { redirect: "manual" })).status, 303, "CSV needs a session");
  await shot(admin, "admin-log");
  step("search log records each outcome with the student, and filters by result");

  /* ---------- Code regeneration invalidates sessions ---------- */
  await parent.goto(BASE);
  await parent.fill("#email", email);
  await parent.fill("#code", code);
  await parent.click("text=عرض التقرير");
  await parent.waitForURL(`${BASE}/report`);
  await admin.goto(`${BASE}/admin/codes`);
  await admin.locator("#roster-search").fill(email);
  await admin.locator("tbody tr").filter({ hasText: email }).getByRole("button", { name: "إعادة توليد" }).click();
  await admin.click("dialog >> text=توليد الرمز");
  await admin.getByText("الرموز الجديدة (1)").waitFor();
  await parent.goto(`${BASE}/report`);
  await parent.waitForURL(`${BASE}/`);
  step("re-issuing a code ends existing parent sessions");

  /* ---------- Teacher turns access codes off, then on again ---------- */
  await sql("DELETE FROM rate_limits");
  await admin.goto(`${BASE}/admin/school`);
  await admin.uncheck("input[name=requireAccessCode]");
  await admin.click("text=حفظ التعديلات");
  await admin.getByText("حُفظت التعديلات").waitFor();
  await parent.goto(BASE);
  assert.equal(await parent.locator("#code").count(), 0, "no code field when codes are off");
  await parent.fill("#email", "nobody@test.school.example");
  await parent.click("text=عرض التقرير");
  await parent.getByText("لم نجد طالبًا بهذا البريد").waitFor();
  await parent.fill("#email", email);
  await parent.click("text=عرض التقرير");
  await parent.waitForURL(`${BASE}/report`);
  await admin.goto(`${BASE}/admin/codes`);
  await admin.getByText("رمز الوصول غير مطلوب حاليًا").waitFor();
  step("codes off: e-mail-only lookup works, unknown e-mail is reported, codes page warns");

  await admin.goto(`${BASE}/admin/school`);
  await admin.check("input[name=requireAccessCode]");
  await admin.click("text=حفظ التعديلات");
  await admin.getByText("حُفظت التعديلات").waitFor();
  await parent.goto(`${BASE}/report`);
  await parent.waitForURL(`${BASE}/`);
  assert.equal(await parent.locator("#code").count(), 1, "code field back");
  const noCode = await fetch(`${BASE}/api/lookup`, { method: "POST", headers: { origin: BASE, "content-type": "application/json" }, body: JSON.stringify({ email }) });
  assert.equal(noCode.status, 400, "code required again");
  step("codes on again: e-mail-only sessions end and the API requires a code");

  /* ---------- Versions & restore ---------- */
  await admin.goto(`${BASE}/admin`);
  await admin.setInputFiles("input[type=file]", path.join(fixtures, "valid.xlsx"));
  await admin.click("text=رفع ومعاينة");
  await admin.getByText("الملف صالح للاعتماد مع تنبيهات").waitFor();
  await admin.click("text=اعتماد البيانات");
  await admin.click("dialog >> text=اعتماد ونشر");
  await admin.getByText("اعتُمدت البيانات الجديدة وأصبحت منشورة لأولياء الأمور.").waitFor();
  await admin.getByRole("button", { name: "استرجاع" }).first().click();
  await admin.click("dialog >> text=استرجاع ونشر");
  await admin.getByText("استُرجعت النسخة المختارة وأصبحت منشورة.").waitFor();
  const [state3] = sql("SELECT active_dataset_id FROM app_state");
  assert.equal(Number(state3.active_dataset_id), Number(state1.active_dataset_id));
  step("second import creates a version; restore switches back");

  // Responsive admin screenshots.
  await admin.setViewportSize({ width: 375, height: 800 });
  await admin.goto(`${BASE}/admin`);
  await shot(admin, "admin-data-mobile");
  assert.equal(await admin.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "admin no overflow at 375px");

  console.log("\nAll smoke checks passed.");
} finally {
  await browser.close();
}
