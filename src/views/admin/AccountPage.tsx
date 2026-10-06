import { PageHead } from "./AdminLayout";

export function AccountContent() {
  return (
    <>
      <PageHead title="الحساب">
        بعد تغيير كلمة المرور تُغلق جميع الجلسات الأخرى، ولا تعود كلمة المرور الأولية المحددة في إعدادات الخادم صالحة.
      </PageHead>
      <section class="panel admin-section" aria-labelledby="pw-title" style="max-width: 520px">
        <div class="admin-section-head">
          <h2 id="pw-title">تغيير كلمة المرور</h2>
        </div>
        <form id="password-form" class="form-grid" novalidate>
          <div class="field">
            <label class="label" for="pw-current">كلمة المرور الحالية</label>
            <input id="pw-current" type="password" class="input ltr" dir="ltr" autocomplete="current-password" maxlength={200} />
          </div>
          <div class="field">
            <label class="label" for="pw-next">كلمة المرور الجديدة</label>
            <input id="pw-next" type="password" class="input ltr" dir="ltr" autocomplete="new-password" maxlength={200} aria-describedby="pw-hint" />
            <p class="hint" id="pw-hint">12 حرفًا على الأقل.</p>
          </div>
          <div class="field">
            <label class="label" for="pw-confirm">تأكيد كلمة المرور الجديدة</label>
            <input id="pw-confirm" type="password" class="input ltr" dir="ltr" autocomplete="new-password" maxlength={200} />
          </div>
          <div id="form-message" aria-live="polite"></div>
          <div class="actions">
            <button type="submit" class="btn btn-primary">
              <span class="spinner" aria-hidden="true" hidden></span>
              <span class="btn-label">حفظ كلمة المرور</span>
            </button>
          </div>
        </form>
      </section>
    </>
  );
}
