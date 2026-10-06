// Builds browser bundles and the single stylesheet into public/assets.
import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const out = "public/assets";
await mkdir(out, { recursive: true });

await build({
  entryPoints: ["lookup", "report", "login", "admin", "admin-import"].map((n) => `src/client/${n}.ts`),
  outdir: out,
  bundle: true,
  minify: true,
  format: "esm",
  target: "es2020",
  platform: "browser",
  legalComments: "none",
  logLevel: "warning",
});

const styles = ["fonts", "tokens", "base", "components", "report", "public", "admin"];
const css = (await Promise.all(styles.map((s) => readFile(`src/styles/${s}.css`, "utf8")))).join("\n");
await writeFile(`${out}/app.css`, css);
console.log("client assets built");
