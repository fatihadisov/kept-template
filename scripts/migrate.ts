/**
 * npm run setup — creates/updates the SQLite database for your real data.
 * (The app also does this automatically on start; this is just handy to run once explicitly.)
 */
import "dotenv/config";
import { dbFile } from "../src/server/db";
import { migrateFile } from "../src/server/migrate";

const file = dbFile("real");
const { applied } = migrateFile(file);
console.log(applied.length ? `Applied ${applied.length} migration(s) to ${file}` : `Database is up to date: ${file}`);
