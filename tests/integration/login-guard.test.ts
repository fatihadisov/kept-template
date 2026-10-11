import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LOCK_MINUTES, MAX_TRIES, guardKeyOf, guardedTry, messageFor } from "@/server/login-guard";
import { type TempDb, tempDb } from "./helpers";

const MINUTE = 60_000;
const T0 = Date.UTC(2026, 9, 9, 12, 0, 0);
const KEY = "key-a";

let t: TempDb;
beforeEach(async () => {
  t = await tempDb("guard");
});
afterEach(async () => {
  await t.dispose();
});

/** Tries `guess` against `secret`, counting how often the password was actually looked at. */
function player(secret = "1234") {
  const state = { checks: 0 };
  const attempt = (guess: string, now: number, key = KEY) =>
    guardedTry(
      t.db,
      key,
      () => {
        state.checks++;
        return guess === secret;
      },
      now,
    );
  return { state, attempt };
}

describe("the sign-in brake", () => {
  it("lets the first five wrong tries through, counting them down, then pauses", async () => {
    const { state, attempt } = player();
    const results = [];
    for (let i = 0; i < MAX_TRIES; i++) results.push(await attempt("0000", T0 + i * 1000));

    expect(results.map((r) => (r.kind === "wrong" ? r.triesLeft : -1))).toEqual([4, 3, 2, 1, 0]);
    expect(results.map((r) => r.kind === "wrong" && r.paused)).toEqual([false, false, false, false, true]);
    expect(state.checks).toBe(MAX_TRIES);

    // paused: nothing is checked any more, not even the right password
    const wrong = await attempt("1111", T0 + 10_000);
    const right = await attempt("1234", T0 + 11_000);
    expect(wrong).toMatchObject({ kind: "locked" });
    expect(right).toMatchObject({ kind: "locked" });
    expect(state.checks).toBe(MAX_TRIES);
    if (right.kind === "locked") expect(right.retryAfterMs).toBeGreaterThan((LOCK_MINUTES - 1) * MINUTE);
  });

  it("opens with the right password, and that clears the count", async () => {
    const { attempt } = player();
    await attempt("0000", T0);
    await attempt("0000", T0 + 1000);
    await attempt("0000", T0 + 2000);
    expect(await attempt("1234", T0 + 3000)).toEqual({ kind: "ok" });

    // a full set of tries is available again
    const next = await attempt("0000", T0 + 4000);
    expect(next).toEqual({ kind: "wrong", triesLeft: MAX_TRIES - 1, paused: false });
  });

  it("after the pause allows one try; a wrong one pauses again, the right one opens", async () => {
    const { state, attempt } = player();
    for (let i = 0; i < MAX_TRIES; i++) await attempt("0000", T0 + i * 1000);
    const after = T0 + LOCK_MINUTES * MINUTE + 10_000;

    // the pause is still on a second before it ends
    expect(await attempt("1234", T0 + LOCK_MINUTES * MINUTE - 1000)).toMatchObject({ kind: "locked" });

    const retry = await attempt("0000", after);
    expect(retry).toEqual({ kind: "wrong", triesLeft: 0, paused: true });
    expect(await attempt("1234", after + 1000)).toMatchObject({ kind: "locked" });
    expect(state.checks).toBe(MAX_TRIES + 1);

    // the next window: the right password is accepted and clears everything
    const later = after + LOCK_MINUTES * MINUTE + 1000;
    expect(await attempt("1234", later)).toEqual({ kind: "ok" });
    expect(await attempt("0000", later + 1000)).toEqual({ kind: "wrong", triesLeft: MAX_TRIES - 1, paused: false });
  });

  it("forgives an old count after a quiet day", async () => {
    const { attempt } = player();
    for (let i = 0; i < 4; i++) await attempt("0000", T0 + i * 1000);
    const nextDay = T0 + 25 * 60 * MINUTE;
    expect(await attempt("0000", nextDay)).toEqual({ kind: "wrong", triesLeft: MAX_TRIES - 1, paused: false });
  });

  it("starts afresh when the password or the secret changes", async () => {
    const { attempt } = player();
    for (let i = 0; i < MAX_TRIES; i++) await attempt("0000", T0 + i * 1000, "key-a");
    expect(await attempt("1234", T0 + 6000, "key-a")).toMatchObject({ kind: "locked" });

    // same moment, but a new password was configured and the app redeployed: not locked any more
    expect(await attempt("1234", T0 + 7000, "key-b")).toEqual({ kind: "ok" });
  });

  it("never checks more than five passwords, however many arrive at once", async () => {
    const { state, attempt } = player();
    const burst = await Promise.all(Array.from({ length: 40 }, (_, i) => attempt(String(1000 + i), T0 + 5)));

    expect(state.checks).toBeGreaterThan(0);
    expect(state.checks).toBeLessThanOrEqual(MAX_TRIES);
    expect(burst.filter((r) => r.kind === "wrong").length).toBe(state.checks);
    expect(burst.filter((r) => r.kind === "ok").length).toBe(0);
    // everything else was turned away without looking at the password
    expect(burst.filter((r) => r.kind === "locked" || r.kind === "busy").length).toBe(40 - state.checks);

    // and it stays shut afterwards
    expect(await attempt("1234", T0 + 1000)).toMatchObject({ kind: "locked" });
  });

  it("keeps one row, created on the first try", async () => {
    const { attempt } = player();
    expect(await t.db.loginGuard.count()).toBe(0);
    await attempt("0000", T0);
    await attempt("0000", T0 + 1);
    expect(await t.db.loginGuard.count()).toBe(1);
  });
});

describe("what the form says", () => {
  it("counts down only near the end, then explains the pause", () => {
    expect(messageFor({ kind: "wrong", triesLeft: 4, paused: false })).toBe("That password isn't right.");
    expect(messageFor({ kind: "wrong", triesLeft: 3, paused: false })).toBe("That password isn't right.");
    expect(messageFor({ kind: "wrong", triesLeft: 2, paused: false })).toContain("2 tries left");
    expect(messageFor({ kind: "wrong", triesLeft: 1, paused: false })).toContain("1 try left");
    expect(messageFor({ kind: "wrong", triesLeft: 0, paused: true })).toContain(`paused for ${LOCK_MINUTES} minutes`);
  });

  it("says how long to wait, rounding up", () => {
    expect(messageFor({ kind: "locked", retryAfterMs: 14 * MINUTE + 1 })).toBe("Too many wrong tries. Try again in 15 minutes.");
    expect(messageFor({ kind: "locked", retryAfterMs: 61_000 })).toBe("Too many wrong tries. Try again in 2 minutes.");
    expect(messageFor({ kind: "locked", retryAfterMs: 20_000 })).toBe("Too many wrong tries. Try again in a minute.");
    expect(messageFor({ kind: "busy" })).toContain("try again in a moment");
  });

  it("fingerprints the key without revealing it", () => {
    const key = Buffer.from("some secret key material");
    const id = guardKeyOf(key);
    expect(id).toMatch(/^[0-9a-f]{16}$/);
    expect(id).toBe(guardKeyOf(Buffer.from("some secret key material")));
    expect(id).not.toBe(guardKeyOf(Buffer.from("another key")));
    expect(key.toString("hex")).not.toContain(id);
  });
});
