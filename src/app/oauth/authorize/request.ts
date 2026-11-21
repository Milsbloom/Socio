import { getClient } from "@/lib/oauth";

export type AuthRequest = { clientId: string; clientName: string; redirectUri: string; codeChallenge: string; state: string };

/** Checks an authorize request. Returns the request, or an error to show (never redirect to an unchecked URI). */
export async function checkAuthRequest(p: Record<string, string | undefined>): Promise<AuthRequest | { error: string }> {
  const client = p.client_id ? await getClient(p.client_id) : null;
  if (!client) return { error: "This app isn't registered with Socio. Try adding the connector again." };
  const redirectUri = p.redirect_uri ?? client.redirectUris[0];
  if (!redirectUri || !client.redirectUris.includes(redirectUri)) return { error: "The app's return address doesn't match its registration." };
  if (p.response_type !== "code") return { error: "Only the authorization code flow is supported." };
  if (!p.code_challenge || p.code_challenge_method !== "S256") return { error: "The app must use PKCE (S256)." };
  return { clientId: client.id, clientName: client.name, redirectUri, codeChallenge: p.code_challenge, state: p.state ?? "" };
}
