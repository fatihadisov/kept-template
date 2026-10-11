import { LockKeyhole } from "lucide-react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { BrandMark } from "@/components/shell/brand";
import { APP_NAME } from "@/lib/config";
import { MIN_PASSWORD_LENGTH, MIN_SECRET_LENGTH, SESSION_COOKIE, authMode, checkSession, safeNext } from "@/lib/session-token";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const q = await searchParams;
  const mode = authMode();

  // local use without a password: nothing to sign in to
  if (mode.kind === "off") redirect("/");

  const next = safeNext(q.next);
  if (mode.kind === "on" && checkSession(mode.key, (await cookies()).get(SESSION_COOKIE)?.value).ok) redirect(next);

  // an all-digit password gets the phone's number pad and signs in by itself after the last digit;
  // that also tells a visitor it is digits-only and how many, which the brake on wrong tries makes harmless
  const pinLength = mode.kind === "on" && /^\d+$/.test(mode.password) ? mode.password.length : null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center px-6 py-16 text-center">
      <BrandMark size={72} className="animate-rise" />
      {mode.kind === "on" ? (
        <>
          <h1 className="mt-8 text-balance text-[34px] font-extrabold leading-[1.1] tracking-tight text-ink sm:text-[40px]">Welcome back</h1>
          <p className="mt-3 max-w-xs text-balance text-[15.5px] leading-relaxed text-ink-2">Enter your password to open {APP_NAME}.</p>
          <LoginForm next={next} pinLength={pinLength} />
          <p className="mt-8 inline-flex items-center gap-1.5 text-[13px] text-ink-3">
            <LockKeyhole className="size-3.5" aria-hidden />
            Private. Only you can open this.
          </p>
        </>
      ) : (
        <>
          <h1 className="mt-8 text-balance text-[30px] font-extrabold leading-[1.1] tracking-tight text-ink">{APP_NAME} isn&rsquo;t ready yet</h1>
          <p className="mt-4 max-w-sm text-balance text-[15.5px] leading-relaxed text-ink-2">
            This copy is online, and for your safety it stays locked until a password is set. {mode.reason}
          </p>
          <p className="mt-3 max-w-sm text-balance text-[14px] leading-relaxed text-ink-3">
            In Vercel, open the project → Settings → Environment Variables and set, for Production, <span className="font-semibold text-ink-2">APP_PASSWORD</span> (at least {MIN_PASSWORD_LENGTH} characters; a 4-digit code works) and{" "}
            <span className="font-semibold text-ink-2">AUTH_SECRET</span> (a long random text, at least {MIN_SECRET_LENGTH} characters). Then redeploy.
          </p>
        </>
      )}
    </main>
  );
}
