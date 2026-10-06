import "server-only";
import createDOMPurify from "dompurify";
import { JSDOM } from "jsdom";

export const MAX_LOGO_BYTES = 1024 * 1024;

export type ValidatedImage = { mime: "image/png" | "image/webp" | "image/svg+xml"; data: Buffer };
export type ImageError = "too_large" | "unsupported" | "invalid_svg";

const SAFE_DATA_IMAGE = /^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=\s]+$/i;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Detects the real type from the bytes; the browser-supplied name and MIME are ignored. */
export function validateLogo(data: Buffer): ValidatedImage | ImageError {
  if (data.length === 0) return "unsupported";
  if (data.length > MAX_LOGO_BYTES) return "too_large";
  if (data.subarray(0, 8).equals(PNG_SIGNATURE)) return { mime: "image/png", data };
  if (data.subarray(0, 4).toString("latin1") === "RIFF" && data.subarray(8, 12).toString("latin1") === "WEBP") {
    return { mime: "image/webp", data };
  }
  const svg = sanitizeSvg(data);
  if (svg === null) return "unsupported";
  if (svg === "invalid") return "invalid_svg";
  return { mime: "image/svg+xml", data: svg };
}

/**
 * Returns sanitised SVG bytes, null if the content is not SVG at all, or
 * "invalid" if it is SVG but nothing usable remains after sanitising.
 * Scripts, event handlers, foreignObject and external references are removed.
 * (Logos are only ever shown via <img>, where SVG scripts cannot run; this is defence in depth.)
 */
function sanitizeSvg(data: Buffer): Buffer | "invalid" | null {
  const text = data.toString("utf8").replace(/^﻿/, "").trim();
  // Must look like an SVG document: optional XML prolog/comments, then <svg.
  if (!/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i.test(text)) return null;
  if (/<!ENTITY/i.test(text)) return "invalid"; // no entity expansion tricks

  const window = new JSDOM("").window;
  const purify = createDOMPurify(window as unknown as Window & typeof globalThis);
  // Links may only point inside the document (#id) or to embedded raster data — never to the network.
  purify.addHook("uponSanitizeAttribute", (_node, data) => {
    if (data.attrName === "href" || data.attrName === "xlink:href") {
      const value = data.attrValue.trim();
      data.keepAttr = value.startsWith("#") || SAFE_DATA_IMAGE.test(value);
      data.forceKeepAttr = data.keepAttr || undefined;
    }
  });
  const clean = purify.sanitize(text, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: ["use"],
    FORBID_TAGS: ["script", "foreignObject", "iframe", "embed", "object", "a", "animate", "set"],
    FORBID_ATTR: ["src", "action", "formaction"],
  });
  window.close();

  if (!/^<svg[\s>]/i.test(clean.trim()) || /<script|javascript:/i.test(clean)) return "invalid";
  let out = clean.trim();
  if (!/xmlns=/.test(out.slice(0, out.indexOf(">")))) {
    out = out.replace(/^<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  return Buffer.from(out, "utf8");
}
