import path from "node:path";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { db } from "./db";
import { writeCronScript } from "./lib/secrets";

export async function migrateOnStart() {
  try {
    writeCronScript();
  } catch (e) {
    console.error("[socio] Could not write the cron script:", e);
  }
  if (!process.env.DATABASE_URL) return;
  try {
    await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
    console.log("[socio] Database is up to date.");
  } catch (e) {
    console.error("[socio] Database migration failed:", e);
  }
}
