import { sql } from "drizzle-orm";
import { db, schema } from "@/db";

/** True until the first owner account exists. */
export async function needsSetup(): Promise<boolean> {
  const [row] = await db.select({ n: sql<number>`count(*)` }).from(schema.users);
  return Number(row?.n ?? 0) === 0;
}

/** First-run setup only accepts the email set in OWNER_EMAIL, so a stranger can't claim the app. */
export function ownerEmail(): string | undefined {
  return process.env.OWNER_EMAIL?.trim().toLowerCase() || undefined;
}
