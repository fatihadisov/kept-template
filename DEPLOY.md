# Put Kept online (Vercel + Neon)

This gives you a private web address that opens on your phone anywhere, without your computer being on.

- **Neon** keeps your data (a free cloud database).
- **Vercel** runs the app (free for personal use).
- A **password** guards everything. Without it nothing opens: no page, no download.

Your local copy keeps working exactly as before. The online copy is a separate copy of your data.

## What you do (about 5 minutes)

1. Go to **vercel.com** and sign in with GitHub.
2. **Add New… → Project**, then pick your private copy of this repository from the list (allow Vercel to see it if it asks).
3. Before pressing Deploy, open **Environment Variables** and add these three, each for **Production**:

   | Name | Value |
   | --- | --- |
   | `DATABASE_URL` | your Neon connection string (it starts with `postgresql://`) |
   | `APP_PASSWORD` | a password you choose: **at least 4 characters**. A 4-digit code works; something longer is safer (see below) |
   | `AUTH_SECRET` | a long random text, **at least 16 characters** (it signs the login cookie, and the app refuses to open without it). To make one, run `openssl rand -hex 32` in a terminal |

4. Press **Deploy**. The first build takes a minute or two and creates the tables in your database by itself.
5. Open the address Vercel shows you, enter your password. Done.
6. On an iPhone, open the address in **Safari** → Share (or the ⋯ menu) → **Add to Home Screen**, leave **Open as Web App** on, then **Add**. It opens full screen from its own icon, like any app.

## Good to know

- **The password is the only lock, and it has a brake.** After **5 wrong tries** sign-in pauses for 15 minutes; once the pause is over, every further wrong try pauses it again until the right password is entered. During a pause even the right password is refused, and devices that are already signed in aren't affected. That keeps a 4-digit code reasonable for personal data, but something longer is still safer. Keep your web address to yourself.
- **Number pad.** If your password is only digits, the sign-in page opens the phone's number pad and signs you in by itself after the last digit. (It also shows how many digits there are, which the brake on wrong tries makes harmless.)
- **Changing the password, forgot it, or locked out?** Change `APP_PASSWORD` in Vercel (Settings → Environment Variables), then **Redeploy**. Every device is signed out, and any pause is cleared.
- **The home-screen app has its own sign-in.** The first time you open it, enter your code once; it then stays signed in for up to 90 days. (Safari and the icon don't share logins.)
- **Added it to the Home Screen before?** Press and hold the old icon → Remove App → Delete App, then add it again. That picks up the name, icon and full-screen settings.
- **Downloads in the home-screen app** (backup, CSV) open the phone's share sheet instead of a file page: choose *Save to Files* or AirDrop.
- **Sign out:** Settings → Security → *Sign out of this device*. You stay signed in on a device for up to 90 days of not opening it.
- **Two copies of your data.** After you start using the online copy, keep using only that one (the local copy won't see new entries). The local file stays as a backup.
- **Backups:** Settings → Your data → *Download backup* now and then. Neon also keeps a short history (a few hours) you can roll back to.
- **Slow first open:** after a few idle minutes the free database naps and the first page takes a second or two to wake up.
- **No demo data online.** That's only on your own computer.

## If the deploy fails

| What the build says | What to do |
| --- | --- |
| `DATABASE_URL is missing or is not a Postgres address` | Add `DATABASE_URL` for **Production**, then Redeploy. |
| `APP_PASSWORD is not set` | Add `APP_PASSWORD` for **Production**, then Redeploy. |
| `AUTH_SECRET is missing or too short` | Add `AUTH_SECRET` for **Production** (16+ random characters, for example from `openssl rand -hex 32`), then Redeploy. |
| The page says "Kept isn't ready yet" | The same: the page names what is missing (a password under 4 characters, or a secret under 16). |

Set the three variables for **Production** only (if Vercel offers *Preview* and *Development*, leave them unticked). Then a preview deployment, which Vercel makes for any branch other than `main`, can't see your data at all and just shows "Kept isn't ready yet". Previews also never change the database's tables.

## For later (changing the app)

Every push to the `main` branch on GitHub deploys automatically. If you change the data model in `prisma/schema.prisma`:

```bash
npm run db:migrate            # the SQLite migration (local)
npm run db:migrate:pg -- name # the matching Postgres migration (online)
```

The online database is upgraded by the next deploy.

## Moving data to the online copy

```bash
DATABASE_URL="postgresql://…direct connection…" npm run db:import -- path/to/backup.json
```

This **replaces** what the online database holds with the backup (Settings → Your data → Download backup). It refuses to run against a local file.
