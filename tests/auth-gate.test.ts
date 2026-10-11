import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_COOKIE, authMode, signSession } from "@/lib/session-token";

// The data layer's own lock: nothing can be read or written without a valid session,
// whether or not the proxy in front of the app ran.
const store = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (store.has(name) ? { name, value: store.get(name) as string } : undefined) }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));

const ENV_KEYS = ["APP_PASSWORD", "AUTH_SECRET", "VERCEL", "DATABASE_URL"] as const;
const saved: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  store.clear();
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

async function requireSession() {
  return (await import("@/server/auth")).requireSession();
}

describe("requireSession", () => {
  it("lets everything through when no password is set (plain local use)", async () => {
    await expect(requireSession()).resolves.toBeUndefined();
  });

  it("sends visitors without a valid session to the login page", async () => {
    process.env.APP_PASSWORD = "a long enough password";
    await expect(requireSession()).rejects.toThrow("REDIRECT:/login");
    store.set(SESSION_COOKIE, "v1.1.2.forged");
    await expect(requireSession()).rejects.toThrow("REDIRECT:/login");
  });

  it("accepts the cookie the login hands out", async () => {
    process.env.APP_PASSWORD = "a long enough password";
    process.env.AUTH_SECRET = "a-long-random-secret-0123456789abcdef";
    const mode = authMode();
    if (mode.kind !== "on") throw new Error("auth should be on");
    store.set(SESSION_COOKIE, signSession(mode.key));
    await expect(requireSession()).resolves.toBeUndefined();
  });

  it("stays locked when hosted without a password, whatever cookie is sent", async () => {
    process.env.VERCEL = "1";
    store.set(SESSION_COOKIE, "anything");
    await expect(requireSession()).rejects.toThrow("REDIRECT:/login");
    delete process.env.VERCEL;
    process.env.DATABASE_URL = "postgres://user:pass@example.invalid/db";
    await expect(requireSession()).rejects.toThrow("REDIRECT:/login");
  });
});

describe("currentDb", () => {
  it("refuses before it touches any database", async () => {
    process.env.APP_PASSWORD = "a long enough password";
    const file = path.resolve(process.cwd(), "data", "finance.db");
    const existed = fs.existsSync(file);
    const { currentDb } = await import("@/server/session");
    await expect(currentDb()).rejects.toThrow("REDIRECT:/login");
    expect(fs.existsSync(file)).toBe(existed); // no database file was created or opened by the refused request
  });
});
