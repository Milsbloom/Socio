import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { accountHealth, listAccounts } from "@/lib/accounts";
import { getPlatform } from "@/platforms";
import Composer, { type ComposerAccount } from "./composer";

export const dynamic = "force-dynamic";

export default async function ComposePage() {
  const { uid } = await requireUser();
  const accounts: ComposerAccount[] = [];
  for (const a of await listAccounts(uid)) {
    const p = getPlatform(a.platform);
    if (!p || accountHealth(a) === "needs_reconnect") continue;
    accounts.push({
      id: a.id,
      name: a.displayName,
      platformLabel: p.label,
      captionLimit: p.captionLimit,
      maxImages: p.maxImages,
      requiresMedia: p.requiresMedia ?? null,
    });
  }

  return (
    <>
      <h1>Compose</h1>
      {accounts.length === 0 ? (
        <p className="card">
          No accounts connected yet. <Link href="/accounts">Connect one</Link> first.
        </p>
      ) : (
        <Composer accounts={accounts} />
      )}
    </>
  );
}
