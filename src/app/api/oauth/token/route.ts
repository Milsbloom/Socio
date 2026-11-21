import { exchangeCode, OAuthError } from "@/lib/oauth";

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(req: Request) {
  const type = req.headers.get("content-type") ?? "";
  const params = type.includes("application/json")
    ? new URLSearchParams(Object.entries((await req.json().catch(() => ({}))) as Record<string, string>))
    : new URLSearchParams(await req.text());

  if (params.get("grant_type") !== "authorization_code") {
    return Response.json({ error: "unsupported_grant_type" }, { status: 400, headers: NO_STORE });
  }
  const code = params.get("code");
  const clientId = params.get("client_id");
  const redirectUri = params.get("redirect_uri");
  const verifier = params.get("code_verifier");
  if (!code || !clientId || !redirectUri || !verifier) {
    return Response.json(
      { error: "invalid_request", error_description: "code, client_id, redirect_uri and code_verifier are required." },
      { status: 400, headers: NO_STORE },
    );
  }
  try {
    const token = await exchangeCode({ code, clientId, redirectUri, verifier });
    return Response.json({ access_token: token, token_type: "Bearer", scope: "socio" }, { headers: NO_STORE });
  } catch (e) {
    if (e instanceof OAuthError) {
      return Response.json({ error: e.code, error_description: e.message }, { status: 400, headers: NO_STORE });
    }
    throw e;
  }
}
