import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { secureCookies } from "./env";
import { secret } from "./secrets";
import { SESSION_COOKIE, SESSION_TTL, sign, verifySigned } from "./session";
import { sha256 } from "./crypto";

export type SessionUser = { uid: number };

export async function currentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  return verifySigned<SessionUser>(jar.get(SESSION_COOKIE)?.value, secret("SESSION_SECRET"));
}

/** For pages and server actions: the signed-in user, or a redirect to the login page. */
export async function requireUser(): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) redirect("/login");
  return u;
}

export async function startSession(uid: number) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await sign({ uid }, secret("SESSION_SECRET"), SESSION_TTL), {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

export async function endSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

/**
 * For API routes used by AI tools: accepts `Authorization: Bearer <api key>`.
 * Returns the key owner's user id, or null.
 */
export async function userFromApiKey(req: Request): Promise<number | null> {
  const header = req.headers.get("authorization") ?? "";
  const m = header.match(/^Bearer\s+(\S+)$/i);
  if (!m) return null;
  const [row] = await db.select().from(schema.apiKeys).where(eq(schema.apiKeys.keyHash, sha256(m[1]))).limit(1);
  if (!row) return null;
  await db.update(schema.apiKeys).set({ lastUsedAt: new Date() }).where(eq(schema.apiKeys.id, row.id));
  return row.userId;
}
