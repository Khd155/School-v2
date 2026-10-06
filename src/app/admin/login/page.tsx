import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/admin/LoginForm";
import { getAdminSession } from "@/lib/server/admin-auth";
import { getSchoolSettings } from "@/lib/server/school";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "دخول المعلم" };

export default async function LoginPage() {
  if (await getAdminSession()) redirect("/admin");
  const settings = await getSchoolSettings();
  return (
    <main className="public-main" id="main">
      <div className="login">
        <header className="masthead">
          <p className="masthead-school">{settings.schoolName}</p>
          <hr className="masthead-rule" />
        </header>
        <section className="panel" aria-labelledby="login-title">
          <h1 id="login-title">دخول المعلم</h1>
          <LoginForm />
        </section>
      </div>
    </main>
  );
}
