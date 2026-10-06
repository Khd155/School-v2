import { Document } from "../Layout";

export function LoginPage({ schoolName }: { schoolName: string }) {
  return (
    <Document title="دخول المعلم" scripts={["login"]}>
      <main class="public-main" id="main">
        <div class="login">
          <header class="masthead">
            <p class="masthead-school">{schoolName}</p>
            <hr class="masthead-rule" />
          </header>
          <section class="panel" aria-labelledby="login-title">
            <h1 id="login-title">دخول المعلم</h1>
            <form id="login-form" novalidate>
              <div class="field">
                <label class="label" for="password">
                  كلمة المرور
                </label>
                <input id="password" type="password" class="input ltr" dir="ltr" autocomplete="current-password" maxlength={200} />
              </div>
              <div id="form-message" aria-live="polite"></div>
              <button type="submit" class="btn btn-primary btn-block">
                <span class="spinner" aria-hidden="true" hidden></span>
                <span class="btn-label">دخول</span>
              </button>
            </form>
          </section>
        </div>
      </main>
    </Document>
  );
}
