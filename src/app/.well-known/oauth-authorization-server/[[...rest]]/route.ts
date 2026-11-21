import { authServerMetadata } from "@/lib/oauth";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(authServerMetadata(), { headers: { "Access-Control-Allow-Origin": "*" } });
}
