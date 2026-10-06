// End-to-end smoke test against a running app with a disposable local database.
// Usage: BASE_URL=http://localhost:3000 DATABASE_URL=postgres://...localhost... ADMIN_PASSWORD=... \
//        CHROMIUM_PATH=/path/to/chrome node tests/e2e/smoke.mjs
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const DB = process.env.DATABASE_URL ?? "";
const PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const SHOTS = process.env.SHOTS_DIR;
const fixtures = path.join(process.cwd(), "tests", "fixtures");

if (!/localhost|127\.0\.0\.1/.test(DB)) throw new Error("Refusing to reset a non-local database");

const sql = postgres(DB, { max: 1, onnotice: () => {} });
await sql`truncate students, class_stats, datasets, import_drafts, access_codes, admin_credentials, admin_sessions, rate_limits, settings_log, logos restart identity cascade`;
// TRUNCATE ... CASCADE also empties app_state (it references datasets).
await sql`insert into app_state (id) values (1) on conflict (id) do update set active_dataset_id = null, data_updated_at = null`;
await sql`update app_settings set school_name = default, education_office = '', academic_year = '', term = '', subject = default, grade = default, enabled_classes = default, teacher_name = '', footer_text = ''`;

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
  const [cred] = await sql`select password_hash from admin_credentials`;
  assert.match(cred.password_hash, /^scrypt\$/, "password stored hashed");

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
  await admin.getByText(/اعتُمدت بيانات 24 طالبًا/).waitFor();
  const [state1] = await sql`select data_updated_at, active_dataset_id from app_state`;
  assert.ok(state1.data_updated_at);
  await shot(admin, "admin-data");
  step("valid workbook previews with warnings and commits");

  /* ---------- Access codes ---------- */
  await admin.goto(`${BASE}/admin/codes`);
  await admin.click("text=توليد رموز للطلاب بلا رمز (24)");
  await admin.getByText("الرموز الجديدة (24)").waitFor();
  const firstRow = admin.locator("#issued-title").locator("xpath=ancestor::section").locator("tbody tr").first();
  const email = (await firstRow.locator("td").nth(2).innerText()).trim();
  const code = (await firstRow.locator("td").nth(3).innerText()).replace(/\s/g, "");
  assert.match(code, /^\d{8}$/);
  const [row] = await sql`select code_hash from access_codes where email = ${email}`;
  assert.ok(row.code_hash.startsWith("scrypt$") && !row.code_hash.includes(code), "code stored hashed");
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
  const [svg] = await sql`select data from logos where kind = 'school'`;
  const svgText = Buffer.from(svg.data).toString("utf8");
  assert.ok(!/script|onload|javascript:|foreignObject|evil\.example/i.test(svgText), `SVG sanitised: ${svgText}`);
  assert.ok(svgText.includes("<rect"), "SVG keeps safe shapes");
  const [state2] = await sql`select data_updated_at from app_state`;
  assert.equal(state2.data_updated_at.getTime(), state1.data_updated_at.getTime(), "settings do not touch data_updated_at");
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
  await parent.locator(".masthead-logos img").first().waitFor();
  assert.equal(await parent.locator(".masthead-logos img").count(), 2);
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
  const [stats] = await sql`select cs.average, cs.highest from class_stats cs join app_state st on st.active_dataset_id = cs.dataset_id where cs.class_no = 4`;
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

  // PDF download.
  const pdfRes = await parent.request.get(`${BASE}/api/report/pdf`);
  assert.equal(pdfRes.status(), 200);
  assert.equal(pdfRes.headers()["content-type"], "application/pdf");
  const pdf = await pdfRes.body();
  assert.ok(pdf.subarray(0, 5).toString() === "%PDF-" && pdf.length > 20_000, `pdf size ${pdf.length}`);
  if (SHOTS) await (await import("node:fs/promises")).writeFile(path.join(SHOTS, "report.pdf"), pdf);
  step(`PDF generated (${Math.round(pdf.length / 1024)} KB)`);

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

  /* ---------- Versions & restore ---------- */
  await admin.goto(`${BASE}/admin`);
  await admin.setInputFiles("input[type=file]", path.join(fixtures, "valid.xlsx"));
  await admin.click("text=رفع ومعاينة");
  await admin.getByText("الملف صالح للاعتماد مع تنبيهات").waitFor();
  await admin.click("text=اعتماد البيانات");
  await admin.click("dialog >> text=اعتماد ونشر");
  await admin.getByText(/اعتُمدت بيانات/).waitFor();
  await admin.getByRole("button", { name: "استرجاع" }).first().click();
  await admin.click("dialog >> text=استرجاع ونشر");
  await admin.getByText(/استُرجعت نسخة/).waitFor();
  const [state3] = await sql`select active_dataset_id from app_state`;
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
  await sql.end();
}
