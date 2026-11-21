import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { pkcePair, randomToken } from "@/lib/crypto";
import { env, secureCookies } from "@/lib/env";
import { sign } from "@/lib/session";
import { getPlatform } from "@/platforms";

const OAUTH_COOKIE = "socio_oauth";

/** Starts connecting an account: sends the user to the platform's sign-in page. */
export async function GET(req: Request, { params }: { params: Promise<{ platform: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const { platform: id } = await params;
  const platform = getPlatform(id);
  if (!platform) return NextResponse.json({ error: "Unknown platform" }, { status: 404 });
  if (!platform.configured()) {
    return NextResponse.redirect(new URL(`/accounts?error=${encodeURIComponent(`${platform.label} app keys are not set yet.`)}`, req.url));
  }

  const state = randomToken(24);
  const { verifier, challenge } = pkcePair();
  const res = NextResponse.redirect(platform.authorizeUrl(state, challenge));
  res.cookies.set(OAUTH_COOKIE, await sign({ state, verifier, platform: id, uid: user.uid }, env("SESSION_SECRET"), 600), {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: "lax",
    path: "/api/connect",
    maxAge: 600,
  });
  return res;
}
