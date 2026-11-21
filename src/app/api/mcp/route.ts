import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { userFromApiKey } from "@/lib/auth";
import { appUrl } from "@/lib/env";
import { buildMcpServer } from "@/lib/mcp";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** MCP over Streamable HTTP, stateless: each request gets its own server bound to the key's owner. */
async function handle(req: Request): Promise<Response> {
  const userId = await userFromApiKey(req);
  if (!userId) {
    return new Response(JSON.stringify({ error: "invalid_token", error_description: "Sign in to Socio to connect." }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "WWW-Authenticate": `Bearer resource_metadata="${appUrl()}/.well-known/oauth-protected-resource"`,
      },
    });
  }
  const server = buildMcpServer(userId);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(req);
}

export { handle as GET, handle as POST, handle as DELETE };
