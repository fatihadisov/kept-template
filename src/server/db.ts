import fs from "node:fs";
import path from "node:path";
import { Prisma, PrismaClient } from "@/generated/prisma/client";
import { ensureBaseData } from "./base";

export type Db = PrismaClient;
/** A Prisma client or the transactional client handed to `$transaction` callbacks. */
export type Tx = PrismaClient | Prisma.TransactionClient;
export { Prisma };

export type DbMode = "real" | "demo";

/*
 * Two ways to store the data, chosen by DATABASE_URL:
 *   - not set, or "file:…"            -> SQLite files on this computer (the default; also used by the tests)
 *   - "postgres://…" / "postgresql://…" -> one hosted Postgres database (e.g. Neon, for a Vercel deployment)
 *
 * The two Prisma clients are generated from the same schema (see scripts/prisma-generate.mjs), so they
 * expose exactly the same models and the rest of the app only ever sees `Db`.
 */

/** True when the app is configured to use hosted Postgres. */
export function usesPostgres(): boolean {
  return /^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL ?? "");
}

/** The demo database is a second SQLite file, so it only exists when running on SQLite. */
export function demoAvailable(): boolean {
  return !usesPostgres();
}

/** Absolute path of the SQLite file for a mode. FINANCE_DB overrides the real database location. */
export function dbFile(mode: DbMode): string {
  // the database location is user configuration at run time, so it is not something to trace into the build
  if (mode === "demo") return path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.FINANCE_DEMO_DB ?? "data/demo.db");
  const configured = process.env.DATABASE_URL;
  const url = process.env.FINANCE_DB ?? (configured?.startsWith("file:") ? configured : "file:./data/finance.db");
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), url.replace(/^file:/, ""));
}

interface Registry {
  clients: Map<string, Promise<PrismaClient>>;
}
const globalRegistry = globalThis as unknown as { __keptDb?: Registry };
const registry: Registry = (globalRegistry.__keptDb ??= { clients: new Map() });

/**
 * Opens (once per process and file) a Prisma client for a SQLite `file`, migrating and seeding base data
 * (settings row, "Existing funds" source, default categories) on first use.
 */
export function openDb(file: string): Promise<PrismaClient> {
  const key = path.resolve(file);
  let pending = registry.clients.get(key);
  if (!pending) {
    pending = (async () => {
      // loaded on demand: a hosted deployment never touches the native SQLite driver
      const [{ PrismaBetterSqlite3 }, { migrateFile }] = await Promise.all([import("@prisma/adapter-better-sqlite3"), import("./migrate")]);
      fs.mkdirSync(path.dirname(key), { recursive: true });
      migrateFile(key);
      const adapter = new PrismaBetterSqlite3({ url: `file:${key}` });
      const client = new PrismaClient({ adapter });
      await ensureBaseData(client);
      return client;
    })();
    registry.clients.set(key, pending);
    pending.catch(() => registry.clients.delete(key));
  }
  return pending;
}

/**
 * `sslmode=require` already means "verify the certificate" in this driver, but newer versions warn that
 * it will change. Saying `verify-full` out loud keeps today's (safe) behaviour and silences the warning.
 */
export function normalizePgUrl(url: string): string {
  return url.replace(/([?&])sslmode=(require|prefer|verify-ca)\b/i, "$1sslmode=verify-full");
}

/** Registry key of a Postgres connection (+ optional schema). */
export function postgresKey(url: string, schema?: string): string {
  return `pg:${url}|${schema ?? ""}`;
}

/**
 * Opens (once per process) a Prisma client for a Postgres database and makes sure the base data exists.
 * The tables themselves are created by `npm run db:deploy:pg` (done automatically on every Vercel deploy).
 * `schema` is only used by the test suite, to give each test its own isolated set of tables.
 */
export function openPostgres(url: string, opts: { schema?: string; max?: number } = {}): Promise<PrismaClient> {
  const key = postgresKey(url, opts.schema);
  let pending = registry.clients.get(key);
  if (!pending) {
    pending = (async () => {
      const [{ PrismaPg }, { PrismaClient: PgPrismaClient }] = await Promise.all([import("@prisma/adapter-pg"), import("@/generated/prisma-pg/client")]);
      // a small pool: each serverless instance only needs a few connections, and the host pools the rest
      const adapter = new PrismaPg(
        { connectionString: normalizePgUrl(url), max: opts.max ?? 3, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 15_000 },
        opts.schema ? { schema: opts.schema } : undefined,
      );
      // same models as the SQLite client (generated from the same schema), so one type serves both
      const client = new PgPrismaClient({ adapter }) as unknown as PrismaClient;
      await ensureBaseData(client);
      return client;
    })();
    registry.clients.set(key, pending);
    pending.catch(() => registry.clients.delete(key));
  }
  return pending;
}

export function openMode(mode: DbMode): Promise<PrismaClient> {
  if (usesPostgres()) return openPostgres(process.env.DATABASE_URL as string);
  return openDb(dbFile(mode));
}

/** Close a client and forget it (used by tests and by "reset demo data"). Takes a SQLite file path or a Postgres key. */
export async function closeDb(fileOrKey: string): Promise<void> {
  const key = fileOrKey.startsWith("pg:") ? fileOrKey : path.resolve(fileOrKey);
  const pending = registry.clients.get(key);
  if (!pending) return;
  registry.clients.delete(key);
  try {
    await (await pending).$disconnect();
  } catch {
    /* already closed */
  }
}

/** Deletes a SQLite file and its sidecars. Only ever used for the demo database and tests. */
export async function removeDbFiles(file: string): Promise<void> {
  await closeDb(file);
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    fs.rmSync(`${path.resolve(file)}${suffix}`, { force: true });
  }
}
