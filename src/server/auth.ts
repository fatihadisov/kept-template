import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, authMode, checkSession } from "@/lib/session-token";

/**
 * The last line of defence: every read or write of data goes through `currentDb()`, which calls this
 * first. So even if the proxy in front of the app were ever skipped (a matcher change, a refactor that
 * moves a server action), nothing can be read or changed without a valid session.
 */
export async function requireSession(): Promise<void> {
  const mode = authMode();
  if (mode.kind === "off") return;
  if (mode.kind === "misconfigured") redirect("/login");
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!checkSession(mode.key, token).ok) redirect("/login");
}

/** True when a password protects this app (so the UI can offer "Sign out"). */
export function passwordProtected(): boolean {
  return authMode().kind === "on";
}
