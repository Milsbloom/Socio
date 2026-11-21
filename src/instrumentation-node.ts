import { existsSync } from "node:fs";
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
    const folder = [path.join(process.cwd(), "drizzle"), path.join(process.cwd(), "..", "drizzle")].find((f) =>
      existsSync(path.join(f, "meta", "_journal.json")),
    );
    if (!folder) throw new Error(`No drizzle folder near ${process.cwd()}`);
    await migrate(db, { migrationsFolder: folder });
    console.log("[socio] Database is up to date.");
  } catch (e) {
    console.error("[socio] Database migration failed:", e);
  }
}
