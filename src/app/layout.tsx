import type { Metadata } from "next";
import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { logout } from "./actions";
import "./globals.css";

export const metadata: Metadata = { title: "Socio", description: "Post everywhere at once." };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  return (
    <html lang="en">
      <body>
        {user && (
          <header className="top">
            <strong>Socio</strong>
            <nav>
              <Link href="/compose">Compose</Link>
              <Link href="/posts">Posts</Link>
              <Link href="/accounts">Accounts</Link>
            </nav>
            <form action={logout}>
              <button className="link">Sign out</button>
            </form>
          </header>
        )}
        <main>{children}</main>
      </body>
    </html>
  );
}
