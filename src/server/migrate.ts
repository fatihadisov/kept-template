import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

/**
 * Applies Prisma's SQL migration files (prisma/migrations/<name>/migration.sql) to a SQLite file and
 * records them in Prisma's own `_prisma_migrations` table, with Prisma's checksum format.
 *
 * Why not just shell out to `prisma migrate deploy`? The app can then start against ANY database
 * file — the real one, the separate demo one, a fresh test one — with no manual step, and both
 * paths stay interchangeable: a database migrated here is accepted by the Prisma CLI and vice versa.
 */
export function migrationsDir(): string {
  return process.env.FINANCE_MIGRATIONS_DIR ?? path.resolve(process.cwd(), "prisma", "migrations");
}

export function migrateFile(file: string): { applied: string[] } {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "checksum" TEXT NOT NULL,
      "finished_at" DATETIME,
      "migration_name" TEXT NOT NULL,
      "logs" TEXT,
      "rolled_back_at" DATETIME,
      "started_at" DATETIME NOT NULL DEFAULT current_timestamp,
      "applied_steps_count" INTEGER UNSIGNED NOT NULL DEFAULT 0
    )`);

    const done = new Set(
      (
        db
          .prepare(`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`)
          .all() as { migration_name: string }[]
      ).map((r) => r.migration_name),
    );

    const dir = migrationsDir();
    const names = fs.existsSync(/*turbopackIgnore: true*/ dir)
      ? fs
          .readdirSync(/*turbopackIgnore: true*/ dir)
          .filter((n) => fs.existsSync(path.join(dir, n, "migration.sql")))
          .sort()
      : [];

    const applied: string[] = [];
    for (const name of names) {
      if (done.has(name)) continue;
      const sql = fs.readFileSync(path.join(dir, name, "migration.sql"), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const now = new Date().toISOString();
      db.transaction(() => {
        db.exec(sql);
        db.prepare(
          `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, started_at, applied_steps_count) VALUES (?, ?, ?, ?, ?, 1)`,
        ).run(randomUUID(), checksum, now, name, now);
      })();
      applied.push(name);
    }
    return { applied };
  } finally {
    db.close();
  }
}
