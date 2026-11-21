import { registerClient, validRedirectUri } from "@/lib/oauth";

/** Dynamic client registration (RFC 7591). Public clients only; PKCE protects the code. */
export async function POST(req: Request) {
  let body: { client_name?: unknown; redirect_uris?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_client_metadata", error_description: "Body must be JSON." }, { status: 400 });
  }
  const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((u): u is string => typeof u === "string") : [];
  if (!uris.length || uris.length > 10 || !uris.every(validRedirectUri)) {
    return Response.json(
      { error: "invalid_redirect_uri", error_description: "Give 1 to 10 redirect_uris, https or localhost." },
      { status: 400 },
    );
  }
  const name = typeof body.client_name === "string" ? body.client_name : "AI app";
  const clientId = await registerClient(name, uris);
  return Response.json(
    {
      client_id: clientId,
      client_name: name,
      redirect_uris: uris,
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      client_id_issued_at: Math.floor(Date.now() / 1000),
    },
    { status: 201 },
  );
}
