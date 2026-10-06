export const MAX_LOGO_BYTES = 1024 * 1024;

export type ValidatedImage = { mime: "image/png" | "image/webp" | "image/svg+xml"; data: Uint8Array<ArrayBuffer> };
export type ImageError = "too_large" | "unsupported" | "invalid_svg";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const ascii = (b: Uint8Array<ArrayBuffer>, from: number, to: number) => String.fromCharCode(...b.subarray(from, to));

/** Detects the real type from the bytes; the browser-supplied name and MIME type are ignored. */
export async function validateLogo(data: Uint8Array<ArrayBuffer>): Promise<ValidatedImage | ImageError> {
  if (data.length === 0) return "unsupported";
  if (data.length > MAX_LOGO_BYTES) return "too_large";
  if (PNG_SIGNATURE.every((b, i) => data[i] === b)) return { mime: "image/png", data };
  if (ascii(data, 0, 4) === "RIFF" && ascii(data, 8, 12) === "WEBP") return { mime: "image/webp", data };
  const svg = await sanitizeSvg(data);
  if (svg === null) return "unsupported";
  if (svg === "invalid") return "invalid_svg";
  return { mime: "image/svg+xml", data: svg };
}

/* Allowlist of SVG elements and attributes that can draw a logo. Everything else is removed. */
const ELEMENTS = new Set([
  "svg", "g", "defs", "symbol", "use", "title", "desc", "style",
  "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
  "text", "tspan", "textpath",
  "lineargradient", "radialgradient", "stop", "pattern", "clippath", "mask", "image",
  "filter", "fegaussianblur", "feoffset", "feblend", "fecolormatrix", "feflood", "fecomposite", "femerge", "femergenode",
]);
const ATTRIBUTE = /^(xmlns(:xlink)?|version|id|class|style|viewbox|preserveaspectratio|width|height|x|y|x1|x2|y1|y2|cx|cy|r|rx|ry|fx|fy|d|points|transform|fill|fill-opacity|fill-rule|clip-rule|stroke|stroke-[a-z-]+|opacity|stop-color|stop-opacity|offset|gradientunits|gradienttransform|spreadmethod|patternunits|patterncontentunits|patterntransform|clip-path|clippathunits|mask|maskunits|maskcontentunits|filter|filterunits|primitiveunits|stddeviation|dx|dy|in|in2|result|mode|values|type|operator|k[1-4]|flood-color|flood-opacity|font-family|font-size|font-weight|font-style|text-anchor|dominant-baseline|letter-spacing|xml:space|display|visibility|overflow|color|href|xlink:href)$/i;
const SAFE_DATA_IMAGE = /^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=\s]+$/i;
const UNSAFE_CSS = /@import|expression\s*\(|javascript:|url\(\s*['"]?\s*(?!#|data:image\/)/i;

/**
 * Returns sanitised SVG bytes, null if the content is not SVG at all, or
 * "invalid" if nothing usable remains. Scripts, event handlers, foreignObject,
 * external references and unknown elements/attributes are removed.
 * (Logos are only ever shown via <img>, where SVG scripts cannot run; this is defence in depth.)
 */
async function sanitizeSvg(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer> | "invalid" | null> {
  const text = new TextDecoder().decode(data).replace(/^﻿/, "").trim();
  if (!/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i.test(text)) return null;
  if (/<!ENTITY/i.test(text)) return "invalid";
  const body = text.slice(text.search(/<svg[\s>]/i)); // drop prolog, comments, doctype

  let rejectedStyle = false;
  const rewriter = new HTMLRewriter()
    .on("*", {
      element(el) {
        const tag = el.tagName.toLowerCase();
        if (!ELEMENTS.has(tag)) {
          el.remove();
          return;
        }
        for (const [name, value] of [...(el.attributes as unknown as Iterable<[string, string]>)]) {
          const v = value.trim();
          const isLink = name === "href" || name === "xlink:href";
          if (
            !ATTRIBUTE.test(name) ||
            (isLink && !(v.startsWith("#") || (tag === "image" && SAFE_DATA_IMAGE.test(v)))) ||
            (name === "style" && UNSAFE_CSS.test(v)) ||
            /javascript:/i.test(v)
          ) {
            el.removeAttribute(name);
          }
        }
      },
    })
    .on("style", {
      text(chunk) {
        if (UNSAFE_CSS.test(chunk.text)) rejectedStyle = true;
      },
    })
    .onDocument({
      comments(c) {
        c.remove();
      },
      doctype() {},
    });

  const out = await rewriter.transform(new Response(body, { headers: { "Content-Type": "text/html" } })).text();
  if (rejectedStyle) return "invalid";
  const clean = out.trim();
  if (!/^<svg[\s>]/i.test(clean) || /<script|javascript:|\son[a-z]+\s*=/i.test(clean)) return "invalid";
  const withNs = /^<svg[^>]*\sxmlns=/i.test(clean) ? clean : clean.replace(/^<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  return new TextEncoder().encode(withNs) as Uint8Array<ArrayBuffer>;
}
