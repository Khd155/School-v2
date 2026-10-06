/**
 * Web Crypto helpers. Hashes are chosen to fit the Workers Free CPU budget:
 * - access codes: HMAC-SHA256(pepper, email:code) — the per-e-mail input acts as salt,
 *   the secret pepper (kept outside the database) makes offline guessing impossible
 *   from a database leak alone, and online guessing is rate-limited.
 * - teacher password: PBKDF2-SHA256 with a random salt, then HMAC with the pepper.
 */
import { ACCESS_CODE_LENGTH } from "../shared/access-code-format";

const enc = new TextEncoder();
const subtle = crypto.subtle;

const toHex = (buf: ArrayBuffer | Uint8Array<ArrayBuffer>) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

const toB64url = (buf: Uint8Array<ArrayBuffer>) =>
  btoa(String.fromCharCode(...buf)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const fromB64url = (s: string): Uint8Array<ArrayBuffer> => {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return new Uint8Array(Array.from(b, (c) => c.charCodeAt(0)));
};

const keyCache = new Map<string, Promise<CryptoKey>>();
function hmacKey(secret: string): Promise<CryptoKey> {
  let key = keyCache.get(secret);
  if (!key) {
    key = subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    keyCache.set(secret, key);
  }
  return key;
}

export async function hmacHex(secret: string, data: string | Uint8Array<ArrayBuffer>): Promise<string> {
  const sig = await subtle.sign("HMAC", await hmacKey(secret), typeof data === "string" ? enc.encode(data) : data);
  return toHex(sig);
}

export async function sha256Hex(data: string | Uint8Array<ArrayBuffer>): Promise<string> {
  return toHex(await subtle.digest("SHA-256", typeof data === "string" ? enc.encode(data) : data));
}

/** Constant-time comparison of two strings. */
export function safeEqual(a: string, b: string): boolean {
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export function randomToken(bytes = 32): string {
  return toB64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** Uniformly random 8-digit code (rejection sampling avoids modulo bias). */
export function generateAccessCode(): string {
  let code = "";
  while (code.length < ACCESS_CODE_LENGTH) {
    for (const b of crypto.getRandomValues(new Uint8Array(16))) {
      if (b < 250 && code.length < ACCESS_CODE_LENGTH) code += String(b % 10);
    }
  }
  return code;
}

export function hashAccessCode(pepper: string, email: string, code: string): Promise<string> {
  return hmacHex(pepper, `access-code:${email}:${code}`);
}

const PBKDF2_ITERATIONS = 20_000;

async function pbkdf2(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array<ArrayBuffer>> {
  const key = await subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256));
}

/** Format: pbkdf2$iterations$salt(b64url)$hmac(pepper, derived)(hex) */
export async function hashPassword(pepper: string, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derived = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return ["pbkdf2", PBKDF2_ITERATIONS, toB64url(salt), await hmacHex(pepper, derived)].join("$");
}

export async function verifyPassword(pepper: string, password: string, stored: string): Promise<boolean> {
  const [scheme, iter, salt, hash] = stored.split("$");
  if (scheme !== "pbkdf2" || !iter || !salt || !hash) return false;
  const derived = await pbkdf2(password, fromB64url(salt), Number(iter));
  return safeEqual(await hmacHex(pepper, derived), hash);
}

/** Signed, tamper-evident token: base64url(json).hmac. Not encrypted — store no secrets in it. */
export async function signPayload(secret: string, payload: object): Promise<string> {
  const body = toB64url(enc.encode(JSON.stringify(payload)) as Uint8Array<ArrayBuffer>);
  return `${body}.${await hmacHex(secret, `cookie:${body}`)}`;
}

export async function verifyPayload<T>(secret: string, token: string | undefined): Promise<T | null> {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  if (!safeEqual(token.slice(dot + 1), await hmacHex(secret, `cookie:${body}`))) return null;
  try {
    return JSON.parse(new TextDecoder().decode(fromB64url(body))) as T;
  } catch {
    return null;
  }
}
