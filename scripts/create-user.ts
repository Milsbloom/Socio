// Creates (or resets the password of) the owner's login.
// Usage: npm run create-user -- you@example.com 'a long password'
import { eq } from "drizzle-orm";
import { db, schema } from "../src/db";
import { hashPassword } from "../src/lib/crypto";

async function main() {
  const [email, password] = process.argv.slice(2);
  if (!email || !password || password.length < 12) {
    console.error("Usage: npm run create-user -- <email> <password of 12+ characters>");
    process.exit(1);
  }
  const passwordHash = await hashPassword(password);
  const normalized = email.trim().toLowerCase();
  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, normalized));
  if (existing) {
    await db.update(schema.users).set({ passwordHash }).where(eq(schema.users.id, existing.id));
    console.log(`Updated the password for ${normalized}.`);
  } else {
    await db.insert(schema.users).values({ email: normalized, passwordHash });
    console.log(`Created ${normalized}.`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
