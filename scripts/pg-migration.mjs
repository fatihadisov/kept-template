/**
 * npm run db:migrate:pg -- <name>
 *
 * After you change prisma/schema.prisma: `npm run db:migrate` writes the SQLite migration, and this
 * writes the matching Postgres one (prisma/postgres/migrations/<time>_<name>/migration.sql), by comparing
 * the Postgres schema as of the last migration (prisma/postgres/applied.schema.prisma) with the new one.
 * The hosted database picks it up on the next deploy.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const pgDir = path.join(root, "prisma", "postgres");
const current = path.join(pgDir, "schema.prisma");
const applied = path.join(pgDir, "applied.schema.prisma");
const prisma = path.join(root, "node_modules", ".bin", "prisma");

const name = (process.argv[2] ?? "").replace(/[^a-z0-9_]+/gi, "_").replace(/^_+|_+$/g, "").toLowerCase();
if (!name) {
  console.error("Usage: npm run db:migrate:pg -- <short_name>   e.g. add_goal_notes");
  process.exit(1);
}

// make sure the derived Postgres schema reflects the latest prisma/schema.prisma
execFileSync("node", [path.join(root, "scripts", "prisma-generate.mjs")], { stdio: "inherit", cwd: root });

const from = fs.existsSync(applied) ? ["--from-schema", applied] : ["--from-empty"];
const sql = execFileSync(prisma, ["migrate", "diff", ...from, "--to-schema", current, "--script"], { cwd: root, encoding: "utf8" });

if (/empty migration/i.test(sql) || !sql.trim()) {
  console.log("No schema changes since the last Postgres migration.");
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
const dir = path.join(pgDir, "migrations", `${stamp}_${name}`);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "migration.sql"), sql);
fs.copyFileSync(current, applied);
console.log(`Wrote ${path.relative(root, path.join(dir, "migration.sql"))}`);
