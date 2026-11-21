import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySigned } from "@/lib/session";

// Pages need a signed-in session. API routes, media files and OAuth callbacks check auth themselves.
const PUBLIC = [/^\/login/, /^\/api\//, /^\/media\//, /^\/_next\//, /^\/favicon/];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((r) => r.test(pathname))) return NextResponse.next();
  const secret = process.env.SESSION_SECRET;
  const ok = secret && (await verifySigned(req.cookies.get(SESSION_COOKIE)?.value, secret));
  if (!ok) return NextResponse.redirect(new URL("/login", req.url));
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
