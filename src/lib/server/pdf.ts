import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Browser } from "puppeteer-core";
import type { ReactElement } from "react";

const STYLE_FILES = ["tokens.css", "base.css", "components.css", "report.css"];
const FONT_WEIGHTS = [400, 500, 600, 700];

let assetsPromise: Promise<string> | null = null;

/** CSS for the PDF: the same stylesheets as the site, with the Arabic font embedded as data URIs. */
function loadAssets(): Promise<string> {
  assetsPromise ??= (async () => {
    const root = process.cwd();
    const fontFaces = await Promise.all(
      FONT_WEIGHTS.flatMap((w) =>
        (["arabic", "latin"] as const).map(async (subset) => {
          const file = await readFile(path.join(root, "public", "fonts", `plex-arabic-${subset}-${w}.woff2`));
          return `@font-face{font-family:"IBM Plex Sans Arabic";font-weight:${w};font-style:normal;src:url(data:font/woff2;base64,${file.toString("base64")}) format("woff2");}`;
        }),
      ),
    );
    const css = await Promise.all(STYLE_FILES.map((f) => readFile(path.join(root, "src", "styles", f), "utf8")));
    return fontFaces.join("\n") + "\n" + css.join("\n");
  })().catch((err) => {
    assetsPromise = null;
    throw err;
  });
  return assetsPromise;
}

async function launchBrowser(): Promise<Browser> {
  const puppeteer = await import("puppeteer-core");
  const localPath = process.env.CHROMIUM_PATH;
  if (localPath) {
    return puppeteer.launch({ executablePath: localPath, headless: true, args: ["--no-sandbox", "--font-render-hinting=none"] });
  }
  const chromium = (await import("@sparticuz/chromium")).default;
  return puppeteer.launch({
    executablePath: await chromium.executablePath(),
    args: [...chromium.args, "--font-render-hinting=none"],
    headless: true,
  });
}

/** Renders report markup to an A4 PDF with embedded fonts (real text, not an image). */
export async function renderReportPdf(element: ReactElement, title: string): Promise<Buffer> {
  // Loaded lazily: Next.js forbids static react-dom/server imports in the App Router graph.
  const { renderToStaticMarkup } = await import("react-dom/server");
  const bodyHtml = renderToStaticMarkup(element);
  const css = await loadAssets();
  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${css}</style></head><body>${bodyHtml}</body></html>`;

  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    // No network: everything (fonts, logos) is inlined.
    await page.setRequestInterception(true);
    page.on("request", (r) => (r.url().startsWith("data:") ? r.continue() : r.abort()));
    // The markup comes from React's escaped server render and contains no scripts.
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate("document.fonts.ready");
    const pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
