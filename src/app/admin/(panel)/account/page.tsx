import { PasswordForm } from "@/components/admin/PasswordForm";

export default function AccountPage() {
  return (
    <>
      <div className="admin-page-head">
        <h1>الحساب</h1>
        <p>بعد تغيير كلمة المرور تُغلق جميع الجلسات الأخرى، ولا تعود كلمة المرور الأولية المحددة في إعدادات الخادم صالحة.</p>
      </div>
      <section className="panel admin-section" aria-labelledby="pw-title" style={{ maxWidth: 520 }}>
        <div className="admin-section-head">
          <h2 id="pw-title">تغيير كلمة المرور</h2>
        </div>
        <PasswordForm />
      </section>
    </>
  );
}
