import path from "node:path";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { db } from "./db";

export async function migrateOnStart() {
  if (!process.env.DATABASE_URL) return;
  try {
    await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
    console.log("[socio] Database is up to date.");
  } catch (e) {
    console.error("[socio] Database migration failed:", e);
  }
}
