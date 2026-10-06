import type { Env } from "./env";

/**
 * Renders report HTML to an A4 PDF with Cloudflare Browser Rendering.
 * The page loads the site's own stylesheet and self-hosted Arabic font
 * (via <base>), so the PDF embeds the real font and matches the web/print view.
 * Only same-origin requests are allowed from the rendered page.
 */
export async function renderReportPdf(env: Env, origin: string, bodyHtml: string, title: string): Promise<Uint8Array<ArrayBuffer>> {
  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><base href="${origin}/"><title>${escapeHtml(title)}</title><link rel="stylesheet" href="/assets/app.css"></head><body>${bodyHtml}</body></html>`;
  // Loaded on demand so ordinary requests do not pay for initialising the client.
  const { default: puppeteer } = await import("@cloudflare/puppeteer");
  const browser = await puppeteer.launch(env.BROWSER as never);
  try {
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const url = req.url();
      if (url.startsWith(`${origin}/`) || url.startsWith("data:")) void req.continue();
      else void req.abort();
    });
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 20_000 });
    const pdf = await page.pdf({ format: "a4", printBackground: true, preferCSSPageSize: true });
    return new Uint8Array(pdf) as Uint8Array<ArrayBuffer>;
  } finally {
    await browser.close();
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
