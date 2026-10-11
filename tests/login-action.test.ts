import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_COOKIE, authMode } from "@/lib/session-token";
import { closeDb, openDb } from "@/server/db";
import { MAX_TRIES, guardKeyOf, guardedTry } from "@/server/login-guard";

// The real sign-in action, with the Next.js request pieces mocked and a scratch SQLite file for the brake.
const store = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (store.has(name) ? { name, value: store.get(name) as string } : undefined),
    set: (name: string, value: string) => void store.set(name, value),
    delete: (name: string) => void store.delete(name),
  }),
  headers: async () => ({ get: () => null }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));

const ENV_KEYS = ["APP_PASSWORD", "AUTH_SECRET", "VERCEL", "DATABASE_URL", "FINANCE_DB"] as const;
const saved: Record<string, string | undefined> = {};
let dir: string;
let file: string;

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "kept-login-"));
  file = path.join(dir, "login.db");
  process.env.FINANCE_DB = file;
  process.env.APP_PASSWORD = "1234";
  process.env.AUTH_SECRET = "a-long-random-secret-0123456789abcdef";
  store.clear();
});

afterEach(async () => {
  vi.useRealTimers();
  await closeDb(file);
  fs.rmSync(dir, { recursive: true, force: true });
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const form = (password: string, next = "/") => {
  const data = new FormData();
  data.set("password", password);
  data.set("next", next);
  return data;
};

async function login(password: string, next?: string) {
  const { loginAction } = await import("@/app/auth-actions");
  try {
    return { state: await loginAction({}, form(password, next)), redirectedTo: null as string | null };
  } catch (error) {
    const match = /^REDIRECT:(.*)$/.exec(error instanceof Error ? error.message : "");
    if (!match) throw error;
    return { state: null, redirectedTo: match[1] };
  }
}

describe("signing in", () => {
  it("opens with the right 4-digit code and goes where you were headed", async () => {
    const result = await login("1234", "/wallets");
    expect(result.redirectedTo).toBe("/wallets");
    expect(store.get(SESSION_COOKIE)).toMatch(/^v1\./);
  });

  it("says no to a wrong code, without a cookie", async () => {
    const result = await login("1235");
    expect(result.state?.error).toBe("That password isn't right.");
    expect(store.has(SESSION_COOKIE)).toBe(false);
  });

  it("is not set up when the app has no usable password and secret", async () => {
    delete process.env.AUTH_SECRET;
    const result = await login("1234");
    expect(result.state?.error).toMatch(/isn't set up/);
    expect(store.has(SESSION_COOKIE)).toBe(false);
  });

  it("pauses after the wrong tries, refuses even the right code meanwhile, and opens again later", async () => {
    // four wrong tries already happened (set up directly: each real wrong try waits a second on purpose)
    const mode = authMode();
    if (mode.kind !== "on") throw new Error("auth should be on");
    const db = await openDb(file);
    for (let i = 0; i < MAX_TRIES - 1; i++) await guardedTry(db, guardKeyOf(mode.key), () => false);

    const fifth = await login("0000");
    expect(fifth.state?.error).toMatch(/paused for 15 minutes/);

    const rightButPaused = await login("1234");
    expect(rightButPaused.redirectedTo).toBeNull();
    expect(rightButPaused.state?.error).toMatch(/Too many wrong tries\. Try again in (15|14) minutes/);
    expect(store.has(SESSION_COOKIE)).toBe(false);

    // sixteen minutes later the pause is over
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 16 * 60_000);
    const later = await login("1234", "/savings");
    expect(later.redirectedTo).toBe("/savings");
    expect(store.get(SESSION_COOKIE)).toMatch(/^v1\./);
  });

  it("stays closed when the count can't be kept (no database), instead of letting anyone in", async () => {
    const blocker = path.join(dir, "not-a-folder");
    fs.writeFileSync(blocker, "x");
    process.env.FINANCE_DB = path.join(blocker, "x.db"); // a "folder" that is really a file: can't be opened
    const result = await login("1234");
    expect(result.redirectedTo).toBeNull();
    expect(result.state?.error).toMatch(/Couldn't check right now/);
    expect(store.has(SESSION_COOKIE)).toBe(false);
  });
});
