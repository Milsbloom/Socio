import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { SocialAccount } from "@/db/schema";
import { getPlatform, PlatformError, type ConnectedAccount } from "@/platforms";
import { decrypt, encrypt } from "./crypto";

/** Saves accounts from an OAuth sign-in, updating tokens when the account was connected before. */
export async function saveAccounts(userId: number, platform: string, accounts: ConnectedAccount[]) {
  for (const a of accounts) {
    const values = {
      displayName: a.displayName,
      accessTokenEnc: encrypt(a.tokens.accessToken),
      refreshTokenEnc: a.tokens.refreshToken ? encrypt(a.tokens.refreshToken) : null,
      tokenExpiresAt: a.tokens.expiresAt ?? null,
      status: "connected",
      meta: a.meta ?? {},
    };
    await db
      .insert(schema.socialAccounts)
      .values({ userId, platform, externalId: a.externalId, ...values })
      .onDuplicateKeyUpdate({ set: values });
  }
}

export async function listAccounts(userId: number) {
  return db.select().from(schema.socialAccounts).where(eq(schema.socialAccounts.userId, userId));
}

export async function getAccount(userId: number, id: number) {
  const [row] = await db
    .select()
    .from(schema.socialAccounts)
    .where(and(eq(schema.socialAccounts.id, id), eq(schema.socialAccounts.userId, userId)))
    .limit(1);
  return row;
}

export async function markNeedsReconnect(accountId: number) {
  await db.update(schema.socialAccounts).set({ status: "needs_reconnect" }).where(eq(schema.socialAccounts.id, accountId));
}

/** Returns a usable access token, refreshing it first when it expires within 5 minutes. */
export async function accessToken(acct: SocialAccount): Promise<string> {
  const soon = Date.now() + 5 * 60 * 1000;
  if (!acct.tokenExpiresAt || acct.tokenExpiresAt.getTime() > soon) return decrypt(acct.accessTokenEnc);

  const platform = getPlatform(acct.platform);
  if (!platform?.refresh || !acct.refreshTokenEnc) {
    await markNeedsReconnect(acct.id);
    throw new PlatformError("The sign-in for this account has expired. Reconnect it on the Accounts page.", true);
  }
  try {
    const t = await platform.refresh(decrypt(acct.refreshTokenEnc));
    await db
      .update(schema.socialAccounts)
      .set({
        accessTokenEnc: encrypt(t.accessToken),
        refreshTokenEnc: t.refreshToken ? encrypt(t.refreshToken) : acct.refreshTokenEnc,
        tokenExpiresAt: t.expiresAt ?? null,
        status: "connected",
      })
      .where(eq(schema.socialAccounts.id, acct.id));
    return t.accessToken;
  } catch (e) {
    await markNeedsReconnect(acct.id);
    throw new PlatformError(`Could not refresh the sign-in: ${(e as Error).message}`, true);
  }
}

/** Account health shown in the app and to AI tools. */
export function accountHealth(acct: SocialAccount): "connected" | "expiring" | "needs_reconnect" {
  if (acct.status === "needs_reconnect") return "needs_reconnect";
  const canRefresh = !!acct.refreshTokenEnc && !!getPlatform(acct.platform)?.refresh;
  if (acct.tokenExpiresAt && !canRefresh) {
    const days = (acct.tokenExpiresAt.getTime() - Date.now()) / 86_400_000;
    if (days < 0) return "needs_reconnect";
    if (days < 7) return "expiring";
  }
  return "connected";
}
