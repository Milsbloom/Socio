import { NextResponse, type NextRequest } from "next/server";
import { secret } from "@/lib/secrets";
import { SESSION_COOKIE, verifySigned } from "@/lib/session";

// Pages need a signed-in session. API routes, media files and OAuth callbacks check auth themselves.
const PUBLIC = [/^\/login/, /^\/setup/, /^\/api\//, /^\/\.well-known\//, /^\/media\//, /^\/_next\//, /^\/favicon/];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((r) => r.test(pathname))) return NextResponse.next();
  const ok = await verifySigned(req.cookies.get(SESSION_COOKIE)?.value, secret("SESSION_SECRET"));
  if (!ok) {
    const login = new URL("/login", req.url);
    if (pathname !== "/") login.searchParams.set("next", pathname + req.nextUrl.search);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

// Node.js runtime, so the middleware can read the secrets file.
export const config = { matcher: ["/((?!_next/static|_next/image).*)"], runtime: "nodejs" };
