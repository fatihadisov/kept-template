/**
 * `npx prisma db seed` fills the separate DEMO database (data/demo.db) with about eight months of
 * realistic example data: two salaries, cards, cash, conversions, bills and goals.
 *
 * It never touches your real database: that one starts empty and is created by the app itself on
 * first run (see README.md). The same thing is available as `npm run db:demo` and, inside the app,
 * as "Explore with demo data".
 */
import "../scripts/demo";
