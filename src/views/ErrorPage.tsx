import { Alert } from "./Alert";
import { Document } from "./Layout";

export function ErrorPage({ title, message }: { title: string; message: string }) {
  return (
    <Document title={title}>
      <main class="public-main" id="main">
        <div class="lookup">
          <section class="panel lookup-panel">
            <Alert tone="error" title={title}>
              {message}
            </Alert>
            <p style="margin-top: var(--space-5)">
              <a href="/">العودة إلى صفحة الاستعلام</a>
            </p>
          </section>
        </div>
      </main>
    </Document>
  );
}
