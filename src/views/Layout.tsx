import type { Child } from "hono/jsx";

type Props = {
  title: string;
  children: Child;
  /** Client bundles from /assets (built by scripts/build-client.mjs). */
  scripts?: string[];
  /** Admin pages expose the CSRF token to their scripts via a meta tag. */
  csrfToken?: string;
};

export function Document({ title, children, scripts = [], csrfToken }: Props) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
        <meta name="theme-color" content="#11304f" />
        {csrfToken && <meta name="csrf-token" content={csrfToken} />}
        <title>{title}</title>
        <link rel="preload" href="/fonts/plex-arabic-arabic-400.woff2" as="font" type="font/woff2" crossorigin="anonymous" />
        <link rel="stylesheet" href="/assets/app.css" />
      </head>
      <body>
        <a href="#main" class="skip-link">
          انتقل إلى المحتوى
        </a>
        {children}
        {scripts.map((s) => (
          <script type="module" src={`/assets/${s}.js`}></script>
        ))}
      </body>
    </html>
  );
}
