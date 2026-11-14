import type { Child } from "hono/jsx";
import { Document } from "../Layout";
import { LogoutIcon } from "../icons";
import type { PeriodKey } from "../../shared/periods";
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
        {PERIOD_PAGES.has(path) && <PeriodSwitch period={period} back={currentUrl} />}
        {children}
      </main>
      <ConfirmDialogShell />
    </Document>
  );
}

/**
 * Two segmented choices: semester, then period. Each option is a plain link to
 * /admin/period, which remembers the choice and returns to the same page.
 */
function PeriodSwitch({ period, back }: { period: PeriodKey; back: string }) {
  const [, term, part] = period.match(/^t(\d)p(\d)$/)!;
  const href = (key: string) => `/admin/period?${new URLSearchParams({ key, back })}`;
  const Option = ({ to, current, label }: { to: string; current: boolean; label: string }) => (
    <a href={href(to)} class="segmented-option" aria-current={current ? "true" : undefined}>
      {label}
    </a>
  );
  return (
    <div class="period-switch">
      <div class="period-switch-group" role="group" aria-labelledby="term-label">
        <span class="period-switch-label" id="term-label">
          الفصل الدراسي
        </span>
        <div class="segmented">
          <Option to={`t1p${part}`} current={term === "1"} label="الأول" />
          <Option to={`t2p${part}`} current={term === "2"} label="الثاني" />
        </div>
      </div>
      <div class="period-switch-group" role="group" aria-labelledby="part-label">
        <span class="period-switch-label" id="part-label">
          الفترة
        </span>
        <div class="segmented">
          <Option to={`t${term}p1`} current={part === "1"} label="الأولى" />
          <Option to={`t${term}p2`} current={part === "2"} label="الثانية" />
        </div>
      </div>
    </div>
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
