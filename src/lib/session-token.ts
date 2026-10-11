import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/*
 * A deliberately small login for a single-user app: one password (APP_PASSWORD), checked on the server,
 * and a signed cookie that proves "this browser entered it". No accounts, no user table, no third party.
 *
 * Kept off while running on your own computer without APP_PASSWORD. It is required (and the app refuses
 * to serve anything without it) as soon as the app is hosted: on Vercel, or on a Postgres database.
 */

export const SESSION_COOKIE = "kept_session";
export const SESSION_DAYS = 90;
/** Short on purpose: a 4-digit code is allowed. It keeps casual visitors out; it is not strong protection. */
export const MIN_PASSWORD_LENGTH = 4;
/**
 * AUTH_SECRET is part of the key that signs the cookie. It is required, because with a short password the
 * secret is the only thing that stops someone from forging a cookie for every possible code (which would
 * skip the sign-in form, and so its limit on wrong tries, altogether).
 */
export const MIN_SECRET_LENGTH = 16;
/** A session is re-issued on use once it is a day old, so it only expires after 90 days of not opening the app. */
const REFRESH_AFTER_SECONDS = 24 * 60 * 60;
const CLOCK_SKEW_SECONDS = 300;

export type AuthMode =
  /** local use, no password configured: no login screen */
  | { kind: "off" }
  /** hosted without a usable password: nothing is served until it is fixed */
  | { kind: "misconfigured"; reason: string }
  | { kind: "on"; password: string; key: Buffer };

export function isHosted(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.VERCEL) || /^postgres(ql)?:\/\//i.test(env.DATABASE_URL ?? "");
}

export function authMode(env: Record<string, string | undefined> = process.env): AuthMode {
  const password = env.APP_PASSWORD ?? "";
  if (!password) return isHosted(env) ? { kind: "misconfigured", reason: "APP_PASSWORD is not set." } : { kind: "off" };
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { kind: "misconfigured", reason: `APP_PASSWORD is too short: use at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  const secret = env.AUTH_SECRET ?? "";
  if (secret.length < MIN_SECRET_LENGTH) {
    return {
      kind: "misconfigured",
      reason: `AUTH_SECRET is missing or too short: it signs the login cookie, so use a long random text (at least ${MIN_SECRET_LENGTH} characters, for example the output of "openssl rand -hex 32").`,
    };
  }
  // Changing the password (or AUTH_SECRET) changes the key, which signs every browser out at once.
  const key = createHash("sha256").update(`kept-session|${secret}|${password}`).digest();
  return { kind: "on", password, key };
}

const mac = (key: Buffer, body: string) => createHmac("sha256", key).update(body).digest();

/** `v1.<issued>.<expires>.<signature>` (times in seconds). */
export function signSession(key: Buffer, nowSec = Math.floor(Date.now() / 1000)): string {
  const body = `v1.${nowSec}.${nowSec + SESSION_DAYS * 86_400}`;
  return `${body}.${mac(key, body).toString("base64url")}`;
}

export type SessionCheck = { ok: false } | { ok: true; refresh: boolean };

export function checkSession(key: Buffer, token: string | undefined, nowSec = Math.floor(Date.now() / 1000)): SessionCheck {
  if (!token) return { ok: false };
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return { ok: false };
  const [version, issuedText, expiresText, signature] = parts;
  const issued = Number(issuedText);
  const expires = Number(expiresText);
  if (!Number.isInteger(issued) || !Number.isInteger(expires)) return { ok: false };
  const expected = mac(key, `${version}.${issuedText}.${expiresText}`);
  const given = Buffer.from(signature, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false };
  if (nowSec >= expires || issued > nowSec + CLOCK_SKEW_SECONDS) return { ok: false };
  return { ok: true, refresh: nowSec - issued > REFRESH_AFTER_SECONDS };
}

/** Compares digests, so the check takes the same time however much of the password is right. */
export function passwordMatches(given: string, expected: string): boolean {
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/** Where to go after signing in: only paths inside this app, never another site. */
export function safeNext(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\") || /[\r\n\t]/.test(value)) return "/";
  if (value === "/login" || value.startsWith("/login?") || value.startsWith("/login/")) return "/";
  return value;
}

export function sessionCookieOptions(secure: boolean) {
  return { httpOnly: true, secure, sameSite: "lax" as const, path: "/", maxAge: SESSION_DAYS * 86_400 };
}
