import { createHash } from "node:crypto";
import type { Db } from "./db";

/*
 * A short password (a 4-digit code) can be guessed in bulk by a script. This is the brake: after
 * MAX_TRIES wrong tries sign-in is paused for LOCK_MINUTES, and once the pause is over every further wrong
 * try pauses it again, until the right password is entered or a quiet day goes by.
 *
 * The count lives in the database (one row), because a hosted app runs as many short-lived instances that
 * share nothing else. Every try is CLAIMED on that row before the password is looked at, with a
 * compare-and-swap (the update only succeeds if nobody changed the row since it was read). So a burst of
 * parallel guesses can't sneak extra tries through: at most MAX_TRIES passwords are ever checked per pause,
 * however many requests arrive at once. While paused, even the right password is refused.
 */

export const MAX_TRIES = 5;
export const LOCK_MINUTES = 15;
const LOCK_MS = LOCK_MINUTES * 60_000;
/** After this long without a try, an old count is forgiven. */
const QUIET_MS = 24 * 60 * 60_000;
const ROW_ID = "login";
/** How often a try is re-attempted when another request changed the row first (only under a burst). */
const MAX_ROUNDS = 12;

export type TryResult =
  | { kind: "ok" }
  | { kind: "wrong"; triesLeft: number; paused: boolean }
  | { kind: "locked"; retryAfterMs: number }
  | { kind: "busy" };

type Claim = { ok: true; attempts: number; paused: boolean } | { ok: false; result: Extract<TryResult, { kind: "locked" | "busy" }> };

/** Which password + secret a count belongs to: changing either one starts the count afresh. */
export function guardKeyOf(key: Buffer): string {
  return createHash("sha256").update("kept-guard|").update(key).digest("hex").slice(0, 16);
}

async function claimTry(db: Db, keyId: string, now: number): Promise<Claim> {
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const row = await db.loginGuard.findUnique({ where: { id: ROW_ID } });
    if (!row) {
      // the first try ever; if two requests race to create it, the loser simply reads it next round
      await db.loginGuard.create({ data: { id: ROW_ID, keyId } }).catch(() => undefined);
      continue;
    }

    const fresh = row.keyId !== keyId; // a new password or secret: start over
    const until = fresh ? null : row.lockedUntil;
    if (until && until.getTime() > now) return { ok: false, result: { kind: "locked", retryAfterMs: until.getTime() - now } };

    const quiet = fresh || !row.lastTryAt || now - row.lastTryAt.getTime() > QUIET_MS;
    const attempts = (quiet ? 0 : row.attempts) + 1;
    const paused = attempts >= MAX_TRIES;
    const claimed = await db.loginGuard.updateMany({
      where: { id: ROW_ID, version: row.version },
      data: { keyId, attempts, lastTryAt: new Date(now), lockedUntil: paused ? new Date(now + LOCK_MS) : null, version: { increment: 1 } },
    });
    if (claimed.count === 1) return { ok: true, attempts, paused };
  }
  return { ok: false, result: { kind: "busy" } };
}

/**
 * One sign-in try. `check` runs only if the try was claimed, and is never called while sign-in is paused.
 * A correct password clears the count.
 */
export async function guardedTry(db: Db, keyId: string, check: () => boolean, now = Date.now()): Promise<TryResult> {
  const claim = await claimTry(db, keyId, now);
  if (!claim.ok) return claim.result;

  if (check()) {
    await db.loginGuard.updateMany({
      where: { id: ROW_ID },
      data: { attempts: 0, lastTryAt: null, lockedUntil: null, version: { increment: 1 } },
    });
    return { kind: "ok" };
  }
  return { kind: "wrong", triesLeft: Math.max(0, MAX_TRIES - claim.attempts), paused: claim.paused };
}

function waitText(ms: number): string {
  const minutes = Math.ceil(ms / 60_000);
  return minutes <= 1 ? "a minute" : `${minutes} minutes`;
}

/** What the sign-in form says after a try that did not open the app. */
export function messageFor(result: Exclude<TryResult, { kind: "ok" }>): string {
  switch (result.kind) {
    case "locked":
      return `Too many wrong tries. Try again in ${waitText(result.retryAfterMs)}.`;
    case "busy":
      return "Couldn't check right now. Please try again in a moment.";
    case "wrong":
      if (result.paused) return `That password isn't right. Sign-in is paused for ${LOCK_MINUTES} minutes.`;
      if (result.triesLeft <= 2) {
        return `That password isn't right. ${result.triesLeft} ${result.triesLeft === 1 ? "try" : "tries"} left before a ${LOCK_MINUTES}-minute pause.`;
      }
      return "That password isn't right.";
  }
}
