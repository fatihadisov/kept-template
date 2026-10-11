import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { normalizePgUrl } from "./db";

/**
 * Applies the Postgres migration files (prisma/postgres/migrations/<name>/migration.sql) and records
 * them in Prisma's own `_prisma_migrations` table, with Prisma's checksum format, so the Prisma CLI
 * accepts a database migrated here and vice versa.
 *
 * Every step happens inside a transaction guarded by a transaction-level advisory lock. That makes it
 * safe when two deployments start at once, and it works through a connection pooler (a session-level
 * lock would not).
 */
export function pgMigrationsDir(): string {
  return process.env.KEPT_PG_MIGRATIONS_DIR ?? path.resolve(/*turbopackIgnore: true*/ process.cwd(), "prisma", "postgres", "migrations");
}

/** An arbitrary constant: every migrator of this app takes the same lock. */
const LOCK_KEY = 7_274_727_274;

export async function migratePostgres(url: string, opts: { schema?: string } = {}): Promise<{ applied: string[] }> {
  if (opts.schema && !/^[A-Za-z0-9_]+$/.test(opts.schema)) throw new Error(`Unsafe schema name: ${opts.schema}`);
  const client = new Client({ connectionString: normalizePgUrl(url), connectionTimeoutMillis: 20_000 });
  await client.connect();

  /** Runs `fn` in a transaction that holds the migration lock (and, for tests, a private schema). */
  const locked = async <T>(fn: () => Promise<T>): Promise<T> => {
    await client.query("BEGIN");
    try {
      await client.query("SELECT pg_advisory_xact_lock($1)", [LOCK_KEY]);
      if (opts.schema) {
        await client.query(`CREATE SCHEMA IF NOT EXISTS "${opts.schema}"`);
        await client.query(`SET LOCAL search_path TO "${opts.schema}"`);
      }
      const result = await fn();
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    }
  };

  try {
    await locked(() =>
      client.query(`CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
        "id" VARCHAR(36) PRIMARY KEY NOT NULL,
        "checksum" VARCHAR(64) NOT NULL,
        "finished_at" TIMESTAMPTZ,
        "migration_name" VARCHAR(255) NOT NULL,
        "logs" TEXT,
        "rolled_back_at" TIMESTAMPTZ,
        "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "applied_steps_count" INTEGER NOT NULL DEFAULT 0
      )`),
    );

    const dir = pgMigrationsDir();
    const names = fs
      .readdirSync(/*turbopackIgnore: true*/ dir)
      .filter((n) => fs.existsSync(path.join(dir, n, "migration.sql")))
      .sort();

    const applied: string[] = [];
    for (const name of names) {
      const sql = fs.readFileSync(path.join(dir, name, "migration.sql"), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const ran = await locked(async () => {
        const done = await client.query(`SELECT 1 FROM "_prisma_migrations" WHERE "migration_name" = $1 AND "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL`, [name]);
        if (done.rowCount) return false; // another deployment got there first
        await client.query(sql);
        await client.query(
          `INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "started_at", "applied_steps_count") VALUES ($1, $2, now(), $3, now(), 1)`,
          [randomUUID(), checksum, name],
        );
        return true;
      });
      if (ran) applied.push(name);
    }
    return { applied };
  } finally {
    await client.end();
  }
}

/** Drops a schema created for a test run. Refuses anything that is not clearly a test schema. */
export async function dropTestSchema(url: string, schema: string): Promise<void> {
  if (!/^kept_test_[a-z0-9_]+$/.test(schema)) throw new Error(`Refusing to drop schema "${schema}": not a test schema`);
  const client = new Client({ connectionString: normalizePgUrl(url) });
  await client.connect();
  try {
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  } finally {
    await client.end();
  }
}
