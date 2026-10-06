import type { Child } from "hono/jsx";
import { Document } from "../Layout";
import { LogoutIcon } from "../icons";

const LINKS = [
  { href: "/admin", label: "بيانات الطلاب" },
  { href: "/admin/codes", label: "رموز الوصول" },
  { href: "/admin/school", label: "معلومات المدرسة" },
  { href: "/admin/account", label: "الحساب" },
];

type Props = { title: string; path: string; csrfToken: string; schoolName: string; subject: string; scripts?: string[]; children: Child };

export function AdminLayout({ title, path, csrfToken, schoolName, subject, scripts = [], children }: Props) {
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
        {children}
      </main>
      <ConfirmDialogShell />
    </Document>
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
