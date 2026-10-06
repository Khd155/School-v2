import { Hono, type Context } from "hono";
import type { Child } from "hono/jsx";
import { isValidEmail, normalizeAccessCode, normalizeEmail } from "./shared/access-code-format";
import { formatDateTimeRiyadh } from "./shared/format";
import { validateGrid } from "./shared/import/grid";
import { ImportFileError, parseGrid } from "./shared/import/parse";
import {
  changeAdminPassword,
  endAdminSession,
  endReportSession,
  getAdminSession,
  issueCodes,
  MIN_PASSWORD_LENGTH,
  readReportSession,
  startAdminSession,
  startReportSession,
  verifyAccessCode,
  verifyAdminPassword,
} from "./server/auth";
import { safeEqual, sha256Hex } from "./server/crypto";
import { assertSecrets, type AppEnv } from "./server/env";
import { validateLogo } from "./server/images";
import {
  allLookups,
  coverageByClass,
  dailyActivity,
  findStudentLabel,
  listLookups,
  LOOKUP_LOG_KEPT,
  lookupSummary,
  recordLookup,
  type LogFilter,
  type LookupOutcome,
} from "./server/lookup-log";
import { renderReportPdf } from "./server/pdf";
import { clearAttempts, consumeAttempt, LIMITS, pruneRateLimits } from "./server/rate-limit";
import { getLogo, getSchoolInfo, getSchoolSettings, getSettingsLog, LOGO_KINDS, updateSchoolSettings, type LogoChange, type SchoolSettings } from "./server/school";
import {
  commitDraft,
  discardDraft,
  getActiveClassStats,
  getCodeRoster,
  getDataState,
  getStudentReport,
  KEPT_VERSIONS,
  listVersions,
  restoreVersion,
  saveDraft,
} from "./server/students";
import { ErrorPage } from "./views/ErrorPage";
import { LookupPage } from "./views/LookupPage";
import { ReportDocument } from "./views/ReportDocument";
import { ReportPage } from "./views/ReportPage";
import { AccountContent } from "./views/admin/AccountPage";
import { AdminLayout } from "./views/admin/AdminLayout";
import { CodesContent } from "./views/admin/CodesPage";
import { DataContent, ImportPreview } from "./views/admin/DataPage";
import { LoginPage } from "./views/admin/LoginPage";
import { LogContent, OUTCOME_LABELS } from "./views/admin/LogPage";
import { SchoolContent } from "./views/admin/SchoolPage";

const app = new Hono<AppEnv>();

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

app.use("*", async (c, next) => {
  assertSecrets(c.env);
  await next();
  const h = c.res.headers;
  h.set("X-Content-Type-Options", "nosniff");
  h.set("X-Frame-Options", "DENY");
  h.set("Referrer-Policy", "no-referrer");
  h.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  h.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  if (!h.has("Content-Security-Policy")) h.set("Content-Security-Policy", CSP);
  if (!h.has("Cache-Control")) h.set("Cache-Control", "no-store");
});

const page = (c: Context<AppEnv>, node: Child, status: 200 | 404 | 500 = 200) => c.html(`<!doctype html>${String(node)}`, status);
const jsonError = (c: Context<AppEnv>, status: 400 | 401 | 403 | 404 | 409 | 413 | 429 | 500, error: string, extra?: object) => c.json({ error, ...extra }, status);

/** CSRF layer 1: state-changing requests must come from this origin. */
function sameOrigin(c: Context<AppEnv>): boolean {
  const origin = c.req.header("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === new URL(c.req.url).host;
  } catch {
    return false;
  }
}

const clientIp = (c: Context<AppEnv>) => c.req.header("cf-connecting-ip") ?? "unknown";

/* ================================================================== */
/* Public                                                               */
/* ================================================================== */

app.get("/", async (c) => {
  const [school, state] = await Promise.all([getSchoolInfo(c.env.DB), getDataState(c.env.DB)]);
  return page(c, <LookupPage school={school} published={state.activeDatasetId !== null} dataUpdatedAt={state.dataUpdatedAt} />);
});

app.get("/report", async (c) => {
  const email = await readReportSession(c);
  if (!email) return c.redirect("/", 303);
  const [report, school] = await Promise.all([getStudentReport(c.env.DB, email), getSchoolInfo(c.env.DB)]);
  if (!report) return c.redirect("/", 303);
  return page(c, <ReportPage report={report} school={school} issuedAt={new Date()} />);
});

app.get("/logo/:kind", async (c) => {
  const kind = c.req.param("kind");
  if (kind !== "ministry" && kind !== "school") return c.notFound();
  const logo = await getLogo(c.env.DB, kind);
  if (!logo) return c.notFound();
  return c.body(logo.data, 200, {
    "Content-Type": logo.mime,
    // URLs carry a content hash (?v=), so a long cache is safe.
    "Cache-Control": "public, max-age=31536000, immutable",
    // If an SVG is ever opened directly, nothing in it may run or load.
    "Content-Security-Policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox",
  });
});

/**
 * With codes required (default): verifies e-mail + access code. An unknown
 * e-mail and a wrong code return the same 401, after the same work.
 * With codes turned off by the teacher: e-mail only, still rate-limited per IP.
 */
app.post("/api/lookup", async (c) => {
  if (!sameOrigin(c)) return jsonError(c, 403, "forbidden");
  const body = await c.req.json<{ email?: unknown; code?: unknown }>().catch(() => null);
  const email = typeof body?.email === "string" ? normalizeEmail(body.email) : "";
  if (!isValidEmail(email)) return jsonError(c, 400, "invalid_request");

  /**
   * Teacher's search log, written after the response (waitUntil) so it adds no
   * latency. For failed attempts the student label is resolved there too, so the
   * parent-facing response time does not depend on whether the e-mail exists.
   */
  const log = (outcome: LookupOutcome, student?: { name: string; classNo: number } | null) =>
    c.executionCtx.waitUntil(
      (async () => {
        const label = student === undefined ? await findStudentLabel(c.env.DB, email) : null;
        let finalOutcome = outcome;
        // In code mode a 401 covers both cases for the parent; the teacher sees which one it was.
        if (outcome === "wrong_code" && !label) finalOutcome = "email_not_found";
        await recordLookup(c.env.DB, {
          email,
          outcome: finalOutcome,
          studentName: student?.name ?? label?.name ?? null,
          classNo: student?.classNo ?? label?.class_no ?? null,
        });
      })().catch((err) => console.error("lookup log failed", err)),
    );

  const ipBlock = await consumeAttempt(c.env.DB, LIMITS.lookupIp, clientIp(c));
  if (ipBlock) {
    log("rate_limited");
    return jsonError(c, 429, "rate_limited", { retryAfterMinutes: ipBlock });
  }

  const settings = await getSchoolSettings(c.env.DB);
  if (!settings.requireAccessCode) {
    const report = await getStudentReport(c.env.DB, email);
    if (!report) {
      log("email_not_found", null);
      return jsonError(c, 404, "email_not_found");
    }
    await startReportSession(c, email, 0);
    log("success", { name: report.student.name, classNo: report.student.classNo });
    return c.json({ ok: true });
  }

  const code = typeof body?.code === "string" ? normalizeAccessCode(body.code) : null;
  if (!code) return jsonError(c, 400, "invalid_request");
  const emailBlock = await consumeAttempt(c.env.DB, LIMITS.lookupEmail, email);
  if (emailBlock) {
    log("rate_limited");
    return jsonError(c, 429, "rate_limited", { retryAfterMinutes: emailBlock });
  }

  const version = await verifyAccessCode(c.env, email, code);
  if (version === null) {
    log("wrong_code");
    return jsonError(c, 401, "invalid_credentials");
  }

  await clearAttempts(c.env.DB, LIMITS.lookupEmail, email);
  if (Math.random() < 0.02) c.executionCtx.waitUntil(pruneRateLimits(c.env.DB));

  // Identity is verified here, so it is safe to say there is no result.
  const report = await getStudentReport(c.env.DB, email);
  if (!report) {
    log("no_result", null);
    return jsonError(c, 404, "no_result");
  }
  await startReportSession(c, email, version);
  log("success", { name: report.student.name, classNo: report.student.classNo });
  return c.json({ ok: true });
});

app.post("/api/report/logout", (c) => {
  if (!sameOrigin(c)) return jsonError(c, 403, "forbidden");
  endReportSession(c);
  return c.json({ ok: true });
});

app.get("/api/report/pdf", async (c) => {
  const email = await readReportSession(c);
  if (!email) return jsonError(c, 401, "unauthorized");
  const [report, school] = await Promise.all([getStudentReport(c.env.DB, email), getSchoolInfo(c.env.DB)]);
  if (!report) return jsonError(c, 404, "no_result");
  try {
    const origin = new URL(c.req.url).origin;
    const markup = String(<ReportDocument report={report} school={school} issuedAt={new Date()} />);
    const pdf = await renderReportPdf(c.env, origin, markup, `تقرير ${report.student.name}`);
    const filename = `تقرير التحصيل - ${report.student.name}.pdf`;
    return c.body(pdf, 200, {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="report.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    });
  } catch (err) {
    console.error("pdf render failed", err);
    return jsonError(c, 500, "pdf_failed");
  }
});

/* ================================================================== */
/* Teacher dashboard — pages                                            */
/* ================================================================== */

app.get("/admin/login", async (c) => {
  if (await getAdminSession(c)) return c.redirect("/admin", 303);
  const settings = await getSchoolSettings(c.env.DB);
  return page(c, <LoginPage schoolName={settings.schoolName} />);
});

async function adminPage(c: Context<AppEnv>, title: string, content: (settings: SchoolSettings) => Promise<Child> | Child, scripts: string[] = []) {
  const session = await getAdminSession(c);
  if (!session) return c.redirect("/admin/login", 303);
  const settings = await getSchoolSettings(c.env.DB);
  return page(
    c,
    <AdminLayout title={title} path={new URL(c.req.url).pathname} csrfToken={session.csrfToken} schoolName={settings.schoolName} subject={settings.subject} scripts={scripts}>
      {await content(settings)}
    </AdminLayout>,
  );
}

app.get("/admin", (c) =>
  adminPage(
    c,
    "بيانات الطلاب",
    async (settings) => {
      const [state, stats, versions] = await Promise.all([getDataState(c.env.DB), getActiveClassStats(c.env.DB), listVersions(c.env.DB)]);
      return (
        <DataContent
          dataUpdatedAt={state.dataUpdatedAt}
          stats={stats}
          versions={versions}
          enabledClasses={settings.enabledClasses}
          keptVersions={KEPT_VERSIONS}
          flash={c.req.query("done") ?? null}
        />
      );
    },
    ["admin-import"],
  ),
);

app.get("/admin/codes", (c) =>
  adminPage(c, "رموز الوصول", async (settings) => {
    const roster = await getCodeRoster(c.env.DB);
    return (
      <CodesContent
        roster={roster}
        siteUrl={new URL(c.req.url).origin}
        schoolName={settings.schoolName}
        subject={settings.subject}
        grade={settings.grade}
        codesRequired={settings.requireAccessCode}
      />
    );
  }),
);

app.get("/admin/school", (c) =>
  adminPage(c, "معلومات المدرسة", async (settings) => {
    const [info, log] = await Promise.all([getSchoolInfo(c.env.DB), getSettingsLog(c.env.DB)]);
    return <SchoolContent settings={settings} logos={info.logos} log={log} />;
  }),
);

app.get("/admin/log", (c) =>
  adminPage(c, "سجل البحث", async () => {
    const outcomeParam = c.req.query("outcome") ?? "";
    const filter: LogFilter = {
      q: (c.req.query("q") ?? "").trim().slice(0, 100),
      outcome: outcomeParam in OUTCOME_LABELS ? (outcomeParam as LookupOutcome) : "",
      before: Number.isSafeInteger(Number(c.req.query("before"))) && Number(c.req.query("before")) > 0 ? Number(c.req.query("before")) : null,
    };
    const [{ entries, hasMore }, summary, roster] = await Promise.all([listLookups(c.env.DB, filter), lookupSummary(c.env.DB), getDataState(c.env.DB)]);
    const totalStudents = roster.activeDatasetId
      ? ((await c.env.DB.prepare("SELECT student_count FROM datasets WHERE id = ?").bind(roster.activeDatasetId).first<{ student_count: number }>())?.student_count ?? 0)
      : 0;
    const [coverage, daily] = await Promise.all([coverageByClass(c.env.DB), dailyActivity(c.env.DB)]);
    return (
      <LogContent
        entries={entries}
        hasMore={hasMore}
        filter={filter}
        summary={summary}
        totalStudents={totalStudents}
        keptRows={LOOKUP_LOG_KEPT}
        coverage={coverage}
        daily={daily}
      />
    );
  }),
);

/** Full search log as CSV (UTF-8 with BOM so Excel shows Arabic). Read-only, so no CSRF token needed. */
app.get("/admin/log.csv", async (c) => {
  if (!(await getAdminSession(c))) return c.redirect("/admin/login", 303);
  const rows = await allLookups(c.env.DB);
  const cell = (v: string | number | null) => {
    const text = v === null ? "" : String(v);
    const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text; // spreadsheet formula injection
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const lines = [
    ["الوقت (بتوقيت السعودية)", "البريد المدخل", "الطالب", "الفصل", "النتيجة"].map(cell).join(","),
    ...rows.map((r) => [formatDateTimeRiyadh(r.createdAt), r.email, r.studentName, r.classNo, OUTCOME_LABELS[r.outcome]].map(cell).join(",")),
  ];
  const date = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
  return c.body("\uFEFF" + lines.join("\r\n"), 200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="search-log.csv"; filename*=UTF-8''${encodeURIComponent(`سجل البحث - ${date}.csv`)}`,
  });
});

app.get("/admin/account", (c) => adminPage(c, "الحساب", () => <AccountContent />));

/* ================================================================== */
/* Teacher dashboard — API                                              */
/* ================================================================== */

app.post("/api/admin/login", async (c) => {
  if (!sameOrigin(c)) return jsonError(c, 403, "forbidden");
  const body = await c.req.json<{ password?: unknown }>().catch(() => null);
  const password = typeof body?.password === "string" ? body.password : "";
  if (!password || password.length > 200) return jsonError(c, 400, "invalid_request");

  const ip = clientIp(c);
  const ipBlock = await consumeAttempt(c.env.DB, LIMITS.adminIp, ip);
  if (ipBlock) return jsonError(c, 429, "rate_limited", { retryAfterMinutes: ipBlock });
  const globalBlock = await consumeAttempt(c.env.DB, LIMITS.adminGlobal, "all");
  if (globalBlock) return jsonError(c, 429, "rate_limited", { retryAfterMinutes: globalBlock });

  if (!(await verifyAdminPassword(c.env, password))) return jsonError(c, 401, "invalid_credentials");
  await clearAttempts(c.env.DB, LIMITS.adminIp, ip);
  await startAdminSession(c);
  return c.json({ ok: true });
});

/** Every admin API call: same origin + live session + CSRF token header (layer 2). */
const admin = new Hono<AppEnv>();
admin.use("*", async (c, next) => {
  if (!sameOrigin(c)) return c.json({ error: "forbidden" }, 403);
  const session = await getAdminSession(c);
  if (!session) return c.json({ error: "unauthorized" }, 401);
  if (!safeEqual(c.req.header("x-csrf-token") ?? "", session.csrfToken)) return c.json({ error: "forbidden" }, 403);
  c.set("session", session);
  await next();
});

admin.post("/logout", async (c) => {
  await endAdminSession(c, c.get("session"));
  return c.json({ ok: true });
});

admin.post("/password", async (c) => {
  const body = await c.req.json<{ current?: unknown; next?: unknown }>().catch(() => null);
  const current = typeof body?.current === "string" ? body.current : "";
  const next = typeof body?.next === "string" ? body.next : "";
  if (next.length < MIN_PASSWORD_LENGTH || next.length > 200) return c.json({ error: "weak_password" }, 400);
  const result = await changeAdminPassword(c.env, c.get("session"), current, next);
  if (result === "wrong_current") return c.json({ error: "wrong_current" }, 400);
  return c.json({ ok: true });
});

const MAX_IMPORT_BODY = 3 * 1024 * 1024;

/** Receives the grid read in the browser, validates it as untrusted input, stores a draft, returns preview HTML. */
admin.post("/import", async (c) => {
  if (Number(c.req.header("content-length") ?? 0) > MAX_IMPORT_BODY) return c.json({ error: "too_large", message: "حجم البيانات كبير جدًا." }, 413);
  const body = await c.req.json<{ filename?: unknown; sheets?: unknown }>().catch(() => null);
  const filename = typeof body?.filename === "string" && /\.xlsx$/i.test(body.filename) ? body.filename.slice(0, 200) : null;
  if (!filename) return c.json({ error: "bad_type", message: "الملف يجب أن يكون بصيغة ‎.xlsx‎." }, 400);
  const sheets = validateGrid(body?.sheets);
  if (!sheets) return c.json({ error: "invalid_grid", message: "تعذّرت قراءة محتوى الملف." }, 400);

  try {
    const settings = await getSchoolSettings(c.env.DB);
    const result = parseGrid(sheets, settings.enabledClasses);
    const draftId = await saveDraft(c.env.DB, { ...result, filename, enabledClasses: settings.enabledClasses });
    return c.json({ draftId, html: String(<ImportPreview result={result} filename={filename} draftId={draftId} />) });
  } catch (err) {
    if (err instanceof ImportFileError) return c.json({ error: "parse_failed", message: err.message }, 400);
    throw err;
  }
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COMMIT_MESSAGES = {
  not_found: "انتهت صلاحية المعاينة أو اعتُمدت مسبقًا. ارفع الملف مرة أخرى.",
  has_errors: "لا يمكن الاعتماد قبل إصلاح الأخطاء في الملف.",
  classes_changed: "تغيّرت الفصول المفعّلة بعد رفع الملف. ارفع الملف مرة أخرى.",
};

admin.post("/import/commit", async (c) => {
  const body = await c.req.json<{ draftId?: unknown }>().catch(() => null);
  const draftId = typeof body?.draftId === "string" && UUID.test(body.draftId) ? body.draftId : null;
  if (!draftId) return c.json({ error: "invalid_request" }, 400);
  const settings = await getSchoolSettings(c.env.DB);
  try {
    const result = await commitDraft(c.env.DB, draftId, settings.enabledClasses);
    if (!result.ok) return c.json({ error: result.reason, message: COMMIT_MESSAGES[result.reason] }, 409);
    return c.json(result);
  } catch (err) {
    console.error("commit failed", err);
    return c.json({ error: "server_error", message: "فشل الاعتماد، وبقيت البيانات السابقة كما هي." }, 500);
  }
});

admin.post("/import/discard", async (c) => {
  const body = await c.req.json<{ draftId?: unknown }>().catch(() => null);
  if (typeof body?.draftId !== "string" || !UUID.test(body.draftId)) return c.json({ error: "invalid_request" }, 400);
  await discardDraft(c.env.DB, body.draftId);
  return c.json({ ok: true });
});

admin.post("/versions/restore", async (c) => {
  const body = await c.req.json<{ datasetId?: unknown }>().catch(() => null);
  const id = Number(body?.datasetId);
  if (!Number.isSafeInteger(id) || id <= 0) return c.json({ error: "invalid_request" }, 400);
  if (!(await restoreVersion(c.env.DB, id))) return c.json({ error: "not_found", message: "النسخة غير موجودة." }, 404);
  return c.json({ ok: true });
});

/**
 * mode "missing": students without a code; "all": everyone (old codes stop working);
 * "one": a single student. Plain codes are returned once and never stored.
 */
admin.post("/codes", async (c) => {
  const body = await c.req.json<{ mode?: unknown; email?: unknown }>().catch(() => null);
  const roster = await getCodeRoster(c.env.DB);
  let targets: typeof roster;
  if (body?.mode === "missing") targets = roster.filter((s) => !s.codeGeneratedAt);
  else if (body?.mode === "all") targets = roster;
  else if (body?.mode === "one" && typeof body.email === "string") {
    const email = normalizeEmail(body.email);
    targets = roster.filter((s) => s.email === email);
    if (targets.length === 0) return c.json({ error: "not_found", message: "الطالب غير موجود في البيانات الحالية." }, 404);
  } else return c.json({ error: "invalid_request" }, 400);

  const issued = await issueCodes(c.env, targets.map((t) => t.email));
  const byEmail = new Map(issued.map((i) => [i.email, i.code]));
  return c.json({ codes: targets.map((t) => ({ name: t.name, email: t.email, classNo: t.classNo, code: byEmail.get(t.email)! })) });
});

const TEXT_LIMITS: Record<Exclude<keyof SchoolSettings, "enabledClasses" | "requireAccessCode">, number> = {
  schoolName: 120,
  educationOffice: 160,
  academicYear: 40,
  term: 60,
  subject: 80,
  grade: 40,
  teacherName: 80,
  footerText: 500,
};
const REQUIRED = new Set(["schoolName", "subject", "grade"]);
const LOGO_ERRORS = {
  too_large: "حجم الشعار يتجاوز 1 ميجابايت.",
  unsupported: "صيغة الشعار غير مدعومة. الصيغ المقبولة: PNG أو WebP أو SVG.",
  invalid_svg: "ملف SVG غير صالح بعد إزالة المحتوى غير الآمن.",
};

admin.post("/school", async (c) => {
  if (Number(c.req.header("content-length") ?? 0) > 3 * 1024 * 1024) return c.json({ error: "too_large", message: "حجم البيانات كبير جدًا." }, 413);
  const form = await c.req.formData().catch(() => null);
  if (!form) return c.json({ error: "invalid_request", message: "تعذّر استلام البيانات." }, 400);

  const errors: Record<string, string> = {};
  const settings = {} as SchoolSettings;
  for (const [key, max] of Object.entries(TEXT_LIMITS) as [keyof typeof TEXT_LIMITS, number][]) {
    const raw = form.get(key);
    const value = typeof raw === "string" ? raw.replace(/\r\n/g, "\n").trim() : "";
    if (value.length > max) errors[key] = `الحد الأقصى ${max} حرفًا.`;
    if (REQUIRED.has(key) && !value) errors[key] = "هذا الحقل مطلوب.";
    settings[key] = key === "footerText" ? value : value.replace(/\s+/g, " ");
  }

  const classesRaw = form.get("enabledClasses");
  const classes = (typeof classesRaw === "string" ? classesRaw : "")
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .split(/[,،\s]+/)
    .filter(Boolean)
    .map(Number);
  if (classes.length === 0) errors.enabledClasses = "حدد فصلًا واحدًا على الأقل.";
  else if (classes.some((n) => !Number.isInteger(n) || n < 1 || n > 30)) errors.enabledClasses = "أرقام الفصول يجب أن تكون أعدادًا صحيحة بين 1 و30.";
  settings.enabledClasses = [...new Set(classes)].sort((a, b) => a - b);
  // Unchecked checkboxes are not submitted, so absence means "off".
  settings.requireAccessCode = form.get("requireAccessCode") === "1";

  const logoChanges: LogoChange[] = [];
  for (const kind of LOGO_KINDS) {
    if (form.get(`${kind}Remove`) === "1") {
      logoChanges.push({ kind, action: "remove" });
      continue;
    }
    const file = form.get(`${kind}Logo`);
    if (file instanceof File && file.size > 0) {
      const result = await validateLogo(new Uint8Array(await file.arrayBuffer()));
      if (typeof result === "string") errors[`${kind}Logo`] = LOGO_ERRORS[result];
      else logoChanges.push({ kind, action: "replace", mime: result.mime, data: result.data, sha256: await sha256Hex(result.data) });
    }
  }
  if (Object.keys(errors).length > 0) return c.json({ error: "validation", errors, message: "تحقق من الحقول المشار إليها." }, 400);

  const changed = await updateSchoolSettings(c.env.DB, settings, logoChanges);
  return c.json({ changed });
});

app.route("/api/admin", admin);

/* ================================================================== */
/* Errors                                                               */
/* ================================================================== */

app.notFound((c) =>
  c.req.path.startsWith("/api/") ? jsonError(c, 404, "not_found") : page(c, <ErrorPage title="الصفحة غير موجودة" message="تحقق من الرابط أو عد إلى صفحة الاستعلام." />, 404),
);

app.onError((err, c) => {
  console.error("unhandled", err);
  if (c.req.path.startsWith("/api/")) return c.json({ error: "server_error", message: "حدث خطأ غير متوقع." }, 500);
  return page(c, <ErrorPage title="حدث خطأ غير متوقع" message="تعذّر إكمال الطلب الآن. حاول مرة أخرى بعد قليل." />, 500);
});

export default app;
