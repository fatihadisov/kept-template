import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { setModeAction } from "@/app/actions";
import { BrandMark } from "@/components/shell/brand";
import { Button } from "@/components/ui/button";
import { APP_NAME, APP_TAGLINE } from "@/lib/config";
import { usesPostgres } from "@/server/db";
import { completeOnboarding } from "@/server/services/settings";
import { currentDb, getMode } from "@/server/session";

export const metadata = { title: "Welcome" };

async function startFresh() {
  "use server";
  await completeOnboarding(await currentDb());
  revalidatePath("/", "layout");
  redirect("/");
}

async function explore() {
  "use server";
  await setModeAction("demo");
}

export default async function WelcomePage() {
  const db = await currentDb();
  const settings = await db.settings.findUnique({ where: { id: 1 } });
  if (settings?.onboardedAt) redirect("/");
  const mode = await getMode();
  const hosted = usesPostgres();

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center px-6 py-16 text-center">
      <BrandMark size={72} className="animate-rise" />
      <p className="mt-8 text-[15px] font-semibold text-ink-2">Welcome to {APP_NAME}</p>
      <h1 className="mt-2 text-balance text-[38px] font-extrabold leading-[1.08] tracking-tight text-ink sm:text-[46px]">{APP_TAGLINE}</h1>
      <p className="mt-5 max-w-md text-balance text-[16px] leading-relaxed text-ink-2">
        See exactly how much you have, where it sits, which salary it came from and what you&rsquo;ve kept.{" "}
        {hosted ? "Everything is stored in your own private database, behind your password." : "Everything stays on this computer."}
      </p>
      <div className="mt-10 flex w-full max-w-sm flex-col gap-3">
        <form action={startFresh}>
          <Button type="submit" variant="primary" size="lg" className="w-full">
            Start with my own data
          </Button>
        </form>
        {mode === "real" && !hosted ? (
          <form action={explore}>
            <Button type="submit" variant="soft" size="lg" className="w-full">
              Explore with demo data
            </Button>
          </form>
        ) : null}
      </div>
      {hosted ? null : <p className="mt-6 text-[13px] text-ink-3">Demo data lives in its own database, so it never mixes with yours.</p>}
    </main>
  );
}
