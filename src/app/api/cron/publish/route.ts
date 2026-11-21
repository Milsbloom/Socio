import { timingSafeEqual } from "node:crypto";
import { secret } from "@/lib/secrets";
import { runDue } from "@/lib/posts";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: Request): boolean {
  const given = req.headers.get("x-cron-secret") ?? new URL(req.url).searchParams.get("secret") ?? "";
  const want = secret("CRON_SECRET");
  return given.length === want.length && timingSafeEqual(Buffer.from(given), Buffer.from(want));
}

/** Called every minute by a Hostinger cron job: publishes due posts and checks processing uploads. */
export async function GET(req: Request) {
  if (!authorized(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const result = await runDue();
  return Response.json({ ok: true, ...result });
}

export const POST = GET;
