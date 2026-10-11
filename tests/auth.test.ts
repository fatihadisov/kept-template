import { describe, expect, it } from "vitest";
import { MIN_PASSWORD_LENGTH, MIN_SECRET_LENGTH, SESSION_DAYS, authMode, checkSession, passwordMatches, safeNext, signSession } from "@/lib/session-token";

const PASSWORD = "correct horse battery";
const SECRET = "a-long-random-secret-0123456789abcdef";
const ROTATED = "another-long-random-secret-9876543210";
const keyOf = (env: Record<string, string | undefined>) => {
  const mode = authMode(env);
  if (mode.kind !== "on") throw new Error("expected auth to be on");
  return mode.key;
};
const NOW = 1_800_000_000; // a fixed "now" in seconds

describe("when the login is required", () => {
  it("is off for plain local use, with no password set", () => {
    expect(authMode({}).kind).toBe("off");
    expect(authMode({ DATABASE_URL: "file:./data/finance.db" }).kind).toBe("off");
  });

  it("is switched on by a password, even locally", () => {
    expect(authMode({ APP_PASSWORD: PASSWORD, AUTH_SECRET: SECRET }).kind).toBe("on");
  });

  it("fails closed when hosted without a password (Vercel, or a Postgres database)", () => {
    expect(authMode({ VERCEL: "1" })).toMatchObject({ kind: "misconfigured", reason: expect.stringContaining("APP_PASSWORD") });
    expect(authMode({ DATABASE_URL: "postgres://u:p@host/db" }).kind).toBe("misconfigured");
    expect(authMode({ DATABASE_URL: "postgresql://u:p@host/db" }).kind).toBe("misconfigured");
  });

  it("accepts a 4-digit code, and refuses anything shorter", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(4);
    expect(authMode({ APP_PASSWORD: "1234", AUTH_SECRET: SECRET, VERCEL: "1" }).kind).toBe("on");
    expect(authMode({ APP_PASSWORD: "x".repeat(MIN_PASSWORD_LENGTH), AUTH_SECRET: SECRET }).kind).toBe("on");
    expect(authMode({ APP_PASSWORD: "123", AUTH_SECRET: SECRET, VERCEL: "1" })).toMatchObject({
      kind: "misconfigured",
      reason: expect.stringContaining("at least 4"),
    });
  });

  it("needs a long secret too, or a short password could be skipped by forging the cookie", () => {
    expect(MIN_SECRET_LENGTH).toBe(16);
    for (const env of [
      { APP_PASSWORD: "1234", VERCEL: "1" },
      { APP_PASSWORD: "1234", AUTH_SECRET: "", VERCEL: "1" },
      { APP_PASSWORD: "1234", AUTH_SECRET: "x".repeat(MIN_SECRET_LENGTH - 1), VERCEL: "1" },
      { APP_PASSWORD: "1234" }, // even on a local computer, once a password is set
    ]) {
      expect(authMode(env)).toMatchObject({ kind: "misconfigured", reason: expect.stringContaining("AUTH_SECRET") });
    }
    expect(authMode({ APP_PASSWORD: "1234", AUTH_SECRET: "x".repeat(MIN_SECRET_LENGTH), VERCEL: "1" }).kind).toBe("on");
  });

  it("checks the code exactly (a near miss is a miss)", () => {
    expect(passwordMatches("1234", "1234")).toBe(true);
    expect(passwordMatches("1235", "1234")).toBe(false);
    expect(passwordMatches("12345", "1234")).toBe(false);
    expect(passwordMatches("", "1234")).toBe(false);
  });
});

describe("the session cookie", () => {
  const env = { APP_PASSWORD: PASSWORD, AUTH_SECRET: SECRET };
  const key = keyOf(env);

  it("is accepted when it is fresh and correctly signed", () => {
    const token = signSession(key, NOW);
    expect(checkSession(key, token, NOW + 60)).toEqual({ ok: true, refresh: false });
  });

  it("is re-issued once it is a day old, and expires after 90 days", () => {
    const token = signSession(key, NOW);
    expect(checkSession(key, token, NOW + 2 * 86_400)).toEqual({ ok: true, refresh: true });
    expect(checkSession(key, token, NOW + SESSION_DAYS * 86_400 - 1).ok).toBe(true);
    expect(checkSession(key, token, NOW + SESSION_DAYS * 86_400).ok).toBe(false);
  });

  it("is rejected when missing, malformed or edited", () => {
    const token = signSession(key, NOW);
    const [v, issued, expires, mac] = token.split(".");
    expect(checkSession(key, undefined, NOW).ok).toBe(false);
    expect(checkSession(key, "", NOW).ok).toBe(false);
    expect(checkSession(key, "garbage", NOW).ok).toBe(false);
    expect(checkSession(key, `${v}.${issued}.${expires}`, NOW).ok).toBe(false); // no signature
    expect(checkSession(key, `${v}.${issued}.${Number(expires) + 86_400 * 365}.${mac}`, NOW).ok).toBe(false); // extended its own life
    expect(checkSession(key, `${v}.${Number(issued) - 1}.${expires}.${mac}`, NOW).ok).toBe(false);
    expect(checkSession(key, `${v}.${issued}.${expires}.${mac.slice(0, -2)}AA`, NOW).ok).toBe(false);
    expect(checkSession(key, `v2.${issued}.${expires}.${mac}`, NOW).ok).toBe(false);
  });

  it("is rejected when it claims to come from the future", () => {
    const token = signSession(key, NOW + 3600);
    expect(checkSession(key, token, NOW).ok).toBe(false);
  });

  it("stops working when the password or the secret changes (that signs everyone out)", () => {
    const token = signSession(key, NOW);
    expect(checkSession(keyOf({ APP_PASSWORD: "a different password", AUTH_SECRET: SECRET }), token, NOW).ok).toBe(false);
    expect(checkSession(keyOf({ APP_PASSWORD: PASSWORD, AUTH_SECRET: ROTATED }), token, NOW).ok).toBe(false);
    expect(checkSession(keyOf({ APP_PASSWORD: PASSWORD, AUTH_SECRET: SECRET }), token, NOW).ok).toBe(true);
  });
});

describe("the password check", () => {
  it("matches only the exact password", () => {
    expect(passwordMatches(PASSWORD, PASSWORD)).toBe(true);
    expect(passwordMatches(`${PASSWORD} `, PASSWORD)).toBe(false);
    expect(passwordMatches(PASSWORD.toUpperCase(), PASSWORD)).toBe(false);
    expect(passwordMatches("", PASSWORD)).toBe(false);
    expect(passwordMatches("x".repeat(5000), PASSWORD)).toBe(false);
  });
});

describe("where you land after signing in", () => {
  it("keeps paths inside the app", () => {
    expect(safeNext("/transactions?type=EXPENSE&cat=abc")).toBe("/transactions?type=EXPENSE&cat=abc");
    expect(safeNext("/wallets/xyz")).toBe("/wallets/xyz");
    expect(safeNext("/api/export/backup")).toBe("/api/export/backup");
  });

  it("never sends you to another site, or back to the login page", () => {
    for (const bad of ["//evil.example", "https://evil.example", "http://evil.example/x", "javascript:alert(1)", "/\\evil.example", "evil", "", null, undefined]) {
      expect(safeNext(bad as string | null | undefined)).toBe("/");
    }
    expect(safeNext("/login")).toBe("/");
    expect(safeNext("/login?next=/x")).toBe("/");
    expect(safeNext("/ok\r\nSet-Cookie: x=1")).toBe("/");
  });
});
