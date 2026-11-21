// A small OAuth 2.1 server so Claude (and other MCP clients) can connect to Socio as a custom connector.
// Clients register themselves (RFC 7591), the owner approves on a consent page, and the token issued
// is an ordinary Socio API key, so it shows up (and can be revoked) on the Settings page.
import { createHash } from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import { db, schema } from "@/db";
import { appUrl } from "./env";
import { randomToken, sha256 } from "./crypto";

const CODE_TTL_MS = 5 * 60_000;

export function resourceMetadata() {
  return {
    resource: `${appUrl()}/api/mcp`,
    authorization_servers: [appUrl()],
    bearer_methods_supported: ["header"],
    resource_name: "Socio",
  };
}

export function authServerMetadata() {
  const base = appUrl();
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/api/oauth/token`,
    registration_endpoint: `${base}/api/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
  };
}

/** Redirect URIs must be https, or http on localhost for local tools. */
export function validRedirectUri(uri: string): boolean {
  try {
    const u = new URL(uri);
    if (u.hash) return false;
    if (u.protocol === "https:") return true;
    return u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  } catch {
    return false;
  }
}

export async function registerClient(name: string, redirectUris: string[]) {
  const id = randomToken(18);
  await db.insert(schema.oauthClients).values({ id, name: name.slice(0, 255) || "AI app", redirectUris });
  return id;
}

export async function getClient(id: string) {
  const [row] = await db.select().from(schema.oauthClients).where(eq(schema.oauthClients.id, id)).limit(1);
  return row ?? null;
}

export async function createCode(p: { clientId: string; userId: number; redirectUri: string; codeChallenge: string }) {
  const code = randomToken(32);
  await db.delete(schema.oauthCodes).where(lt(schema.oauthCodes.expiresAt, new Date()));
  await db.insert(schema.oauthCodes).values({ ...p, codeHash: sha256(code), expiresAt: new Date(Date.now() + CODE_TTL_MS) });
  return code;
}

/** Creates an API key for a user and returns the plain key. Only the hash is stored. */
export async function issueApiKey(userId: number, name: string): Promise<string> {
  const key = `socio_${randomToken(32)}`;
  await db.insert(schema.apiKeys).values({ userId, name: name.slice(0, 100), keyHash: sha256(key) });
  return key;
}

export class OAuthError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

/** Swaps a one-time code for an access token, checking client, redirect URI and PKCE verifier. */
export async function exchangeCode(p: { code: string; clientId: string; redirectUri: string; verifier: string }) {
  const codeHash = sha256(p.code);
  const [row] = await db.select().from(schema.oauthCodes).where(eq(schema.oauthCodes.codeHash, codeHash)).limit(1);
  // One use only, whatever happens next.
  await db.delete(schema.oauthCodes).where(eq(schema.oauthCodes.codeHash, codeHash));
  if (!row || row.expiresAt.getTime() < Date.now()) throw new OAuthError("invalid_grant", "The code is invalid or expired.");
  if (row.clientId !== p.clientId || row.redirectUri !== p.redirectUri) {
    throw new OAuthError("invalid_grant", "The code was issued to a different client or redirect URI.");
  }
  const challenge = createHash("sha256").update(p.verifier).digest("base64url");
  if (challenge !== row.codeChallenge) throw new OAuthError("invalid_grant", "PKCE verification failed.");
  const client = await getClient(row.clientId);
  return issueApiKey(row.userId, `${client?.name ?? "AI app"} (connector)`);
}

export async function listApiKeys(userId: number) {
  return db.select().from(schema.apiKeys).where(eq(schema.apiKeys.userId, userId));
}

export async function revokeApiKey(userId: number, id: number) {
  await db.delete(schema.apiKeys).where(and(eq(schema.apiKeys.userId, userId), eq(schema.apiKeys.id, id)));
}
