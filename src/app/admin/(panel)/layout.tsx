import type { Metadata } from "next";
import Link from "next/link";
import { AdminProvider } from "@/components/admin/AdminContext";
import { AdminNav } from "@/components/admin/AdminNav";
import { LogoutButton } from "@/components/admin/LogoutButton";
import { requireAdminPage } from "@/lib/server/admin-auth";
import { getSchoolSettings } from "@/lib/server/school";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "لوحة المعلم" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdminPage();
  const settings = await getSchoolSettings();

  return (
    <AdminProvider csrfToken={session.csrfToken}>
      <header className="admin-header">
        <div className="admin-header-inner">
          <div className="admin-brand">
            <p className="admin-brand-title">لوحة المعلم</p>
            <p className="admin-brand-school">
              {settings.schoolName} · {settings.subject}
            </p>
          </div>
          <div className="admin-header-actions">
            <Link href="/" className="btn btn-ghost btn-sm" target="_blank">
              الصفحة العامة
            </Link>
            <LogoutButton />
          </div>
        </div>
      </header>
      <AdminNav />
      <main className="admin-main" id="main">
        {children}
      </main>
    </AdminProvider>
  );
}
