import { resourceMetadata } from "@/lib/oauth";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(resourceMetadata(), { headers: { "Access-Control-Allow-Origin": "*" } });
}
