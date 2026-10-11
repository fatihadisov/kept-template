/**
 * npm run db:demo — (re)creates data/demo.db with ~8 months of realistic example data.
 * In the app, open the sidebar menu → "Explore with demo data". Your real database is never touched.
 */
import "dotenv/config";
import { dbFile, openDb, removeDbFiles } from "../src/server/db";
import { seedDemo } from "../src/server/services/demo";

async function main() {
  const file = dbFile("demo");
  await removeDbFiles(file);
  const db = await openDb(file);
  await seedDemo(db);
  const [accounts, transactions] = await Promise.all([db.account.count(), db.transaction.count()]);
  console.log(`Demo database ready: ${file}\n  ${accounts} accounts, ${transactions} transactions`);
  await db.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
