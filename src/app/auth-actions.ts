"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, authMode, passwordMatches, safeNext, sessionCookieOptions, signSession } from "@/lib/session-token";
import { openMode } from "@/server/db";
import { type TryResult, guardKeyOf, guardedTry, messageFor } from "@/server/login-guard";

export interface LoginState {
  error?: string;
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Checks the password and, if it is right, gives this browser a signed session cookie.
 * Every try goes through the sign-in brake (src/server/login-guard.ts): a few wrong tries pause sign-in.
 */
export async function loginAction(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const mode = authMode();
  if (mode.kind !== "on") return { error: "Login isn't set up yet." };

  const given = String(formData.get("password") ?? "");
  const next = safeNext(String(formData.get("next") ?? ""));

  let result: TryResult;
  try {
    const db = await openMode("real");
    result = await guardedTry(db, guardKeyOf(mode.key), () => passwordMatches(given, mode.password));
  } catch (error) {
    // can't count the try (for example the database is unreachable): stay closed rather than open
    console.error("Sign-in check failed:", error instanceof Error ? error.message : error);
    return { error: "Couldn't check right now. Please try again in a minute." };
  }

  if (result.kind !== "ok") {
    // a small pause after a wrong try; the real limit is the brake above
    if (result.kind === "wrong") await pause(900);
    return { error: messageFor(result) };
  }

  const secure = (await headers()).get("x-forwarded-proto") === "https";
  (await cookies()).set(SESSION_COOKIE, signSession(mode.key), sessionCookieOptions(secure));
  redirect(next);
}

export async function logoutAction(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
