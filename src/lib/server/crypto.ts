import "server-only";
import { createHash, createHmac, randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { ACCESS_CODE_LENGTH } from "@/lib/access-code-format";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;

const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEY_LEN = 32;

/** Format: scrypt$N$r$p$salt(b64)$hash(b64) */
export async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(secret, salt, KEY_LEN, SCRYPT);
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function verifySecret(secret: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, "base64");
  const key = await scrypt(secret, Buffer.from(saltB64, "base64"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT.maxmem,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** A precomputed hash used to spend equal time when no record exists (avoids an enumeration timing oracle). */
let dummyHash: Promise<string> | null = null;
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashSecret(randomBytes(16).toString("hex"));
  return dummyHash;
}

/** Uniformly random 8-digit code (leading zeros allowed). */
export function generateAccessCode(): string {
  let code = "";
  for (let i = 0; i < ACCESS_CODE_LENGTH; i++) code += String(randomInt(0, 10));
  return code;
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

function sessionSecret(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must be set (32+ characters)");
  return Buffer.from(secret);
}

/** Signed, tamper-evident token: base64url(json).base64url(hmac). Not encrypted — store no secrets in it. */
export function signPayload(payload: object): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = createHmac("sha256", sessionSecret()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verifyPayload<T>(token: string | undefined): T | null {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const mac = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(createHmac("sha256", sessionSecret()).update(body).digest("base64url"));
  if (mac.length !== expected.length || !timingSafeEqual(mac, expected)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

export function safeEqualStrings(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}
