import type { Child } from "hono/jsx";
import { Document } from "../Layout";
import { LogoutIcon } from "../icons";
import { periodShortLabel, type PeriodKey } from "../../shared/periods";
import type { PeriodInfo } from "../../server/periods";

const LINKS = [
  { href: "/admin", label: "بيانات الطلاب" },
  { href: "/admin/students", label: "الطلاب" },
  { href: "/admin/grades", label: "تحليل الدرجات" },
  { href: "/admin/codes", label: "رموز الوصول" },
  { href: "/admin/log", label: "سجل البحث" },
  { href: "/admin/periods", label: "الفترات" },
  { href: "/admin/school", label: "معلومات المدرسة" },
  { href: "/admin/account", label: "الحساب" },
];

/** Pages whose content depends on the working period; they show the period selector. */
const PERIOD_PAGES = new Set(["/admin", "/admin/students", "/admin/grades", "/admin/codes", "/admin/log"]);

type Props = {
  title: string;
  path: string;
  currentUrl: string;
  csrfToken: string;
  schoolName: string;
  subject: string;
  periods: PeriodInfo[];
  period: PeriodKey;
  scripts?: string[];
  children: Child;
};

export function AdminLayout({ title, path, currentUrl, csrfToken, schoolName, subject, periods, period, scripts = [], children }: Props) {
  return (
    <Document title={`${title} — لوحة المعلم`} csrfToken={csrfToken} scripts={["admin", ...scripts]}>
      <header class="admin-header">
        <div class="admin-header-inner">
          <div class="admin-brand">
            <p class="admin-brand-title">لوحة المعلم</p>
            <p class="admin-brand-school">
              {schoolName} · {subject}
            </p>
          </div>
          <div class="admin-header-actions">
            <a href="/" class="btn btn-ghost btn-sm" target="_blank" rel="noopener">
              الصفحة العامة
            </a>
            <button type="button" class="btn btn-ghost btn-sm" id="logout">
              <LogoutIcon />
              خروج
            </button>
          </div>
        </div>
      </header>
      <nav class="admin-nav" aria-label="أقسام لوحة المعلم">
        <div class="admin-nav-inner">
          {LINKS.map((l) => (
            <a href={l.href} aria-current={path === l.href ? "page" : undefined}>
              {l.label}
            </a>
          ))}
        </div>
      </nav>
      <main class="admin-main" id="main">
        {PERIOD_PAGES.has(path) && <PeriodSwitch periods={periods} period={period} back={currentUrl} />}
        {children}
      </main>
      <ConfirmDialogShell />
    </Document>
  );
}

/** GET form, so it also works without JavaScript; admin.ts submits it on change. */
function PeriodSwitch({ periods, period, back }: { periods: PeriodInfo[]; period: PeriodKey; back: string }) {
  const current = periods.find((p) => p.key === period);
  return (
    <form class="period-switch" method="get" action="/admin/period" id="period-switch">
      <label class="period-switch-label" for="period-select">
        الفترة
      </label>
      <select class="select" id="period-select" name="key">
        {periods.map((p) => (
          <option value={p.key} selected={p.key === period}>
            {periodShortLabel(p.key)}
            {p.activeDatasetId === null ? " (بلا بيانات)" : ""}
          </option>
        ))}
      </select>
      <input type="hidden" name="back" value={back} />
      <noscript>
        <button type="submit" class="btn btn-secondary btn-sm">
          عرض
        </button>
      </noscript>
      {current && (
        <span class={`period-switch-status${current.visible ? " is-visible" : ""}`}>
          {current.visible ? "ظاهرة لأولياء الأمور" : "مخفية عن أولياء الأمور"}
        </span>
      )}
    </form>
  );
}

/** One shared native <dialog>; admin.ts fills in the text per action. */
function ConfirmDialogShell() {
  return (
    <dialog class="dialog" id="confirm-dialog" aria-labelledby="confirm-title">
      <div class="dialog-body">
        <h2 id="confirm-title"></h2>
        <p id="confirm-body"></p>
      </div>
      <div class="dialog-actions">
        <button type="button" class="btn btn-primary" id="confirm-ok">
          <span class="spinner" aria-hidden="true" hidden></span>
          <span class="btn-label"></span>
        </button>
        <button type="button" class="btn btn-secondary" id="confirm-cancel">
          إلغاء
        </button>
      </div>
    </dialog>
  );
}

export function PageHead({ title, children }: { title: string; children?: Child }) {
  return (
    <div class="admin-page-head">
      <h1>{title}</h1>
      {children && <p>{children}</p>}
    </div>
  );
}
