import { NextResponse, type NextRequest } from "next/server";
import { saveAccounts } from "@/lib/accounts";
import { env } from "@/lib/env";
import { verifySigned } from "@/lib/session";
import { getPlatform } from "@/platforms";

const OAUTH_COOKIE = "socio_oauth";

type OAuthState = { state: string; verifier: string; platform: string; uid: number };

function back(req: NextRequest, query: string) {
  const res = NextResponse.redirect(new URL(`/accounts?${query}`, req.url));
  res.cookies.delete({ name: OAUTH_COOKIE, path: "/api/connect" });
  return res;
}

/** The platform sends the user back here after they approve (or decline) access. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const { platform: id } = await params;
  const platform = getPlatform(id);
  const q = req.nextUrl.searchParams;
  const saved = await verifySigned<OAuthState>(req.cookies.get(OAUTH_COOKIE)?.value, env("SESSION_SECRET"));

  if (!platform) return back(req, "error=Unknown+platform");
  if (q.get("error")) return back(req, `error=${encodeURIComponent(q.get("error_description") ?? q.get("error")!)}`);
  if (!saved || saved.platform !== id || saved.state !== q.get("state")) {
    return back(req, "error=The+sign-in+expired+or+did+not+match.+Please+try+again.");
  }
  const code = q.get("code");
  if (!code) return back(req, "error=No+approval+code+was+returned.");

  try {
    const accounts = await platform.exchange(code, saved.verifier);
    await saveAccounts(saved.uid, id, accounts);
    return back(req, `connected=${encodeURIComponent(accounts.map((a) => a.displayName).join(", "))}`);
  } catch (e) {
    return back(req, `error=${encodeURIComponent((e as Error).message)}`);
  }
}
