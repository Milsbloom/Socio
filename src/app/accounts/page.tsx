import { requireUser } from "@/lib/auth";
import { accountHealth, listAccounts } from "@/lib/accounts";
import { PLATFORMS } from "@/platforms";
import { disconnect } from "../actions";

export const dynamic = "force-dynamic";

const HEALTH_LABEL = { connected: "Connected", expiring: "Expires soon", needs_reconnect: "Needs reconnect" };

export default async function AccountsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const { uid } = await requireUser();
  const q = await searchParams;
  const accounts = await listAccounts(uid);

  return (
    <>
      <h1>Accounts</h1>
      {q.error && <p className="notice error">{q.error}</p>}
      {q.connected && <p className="notice ok">Connected {q.connected}.</p>}
      {PLATFORMS.map((p) => {
        const mine = accounts.filter((a) => a.platform === p.id);
        return (
          <div className="card" key={p.id}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong>{p.label}</strong>
              {p.configured() ? (
                <a className="button secondary" href={`/api/connect/${p.id}`}>
                  {mine.length ? "Connect another" : "Connect"}
                </a>
              ) : (
                <span className="muted small">App keys not set yet</span>
              )}
            </div>
            {mine.length > 0 && (
              <ul className="targets">
                {mine.map((a) => {
                  const health = accountHealth(a);
                  return (
                    <li key={a.id} className="row" style={{ justifyContent: "space-between" }}>
                      <span>
                        {a.displayName} <span className={`badge s-${health}`}>{HEALTH_LABEL[health]}</span>
                        {a.tokenExpiresAt && (
                          <span className="muted small"> · sign-in valid until {a.tokenExpiresAt.toLocaleDateString()}</span>
                        )}
                      </span>
                      <span className="row">
                        {health !== "connected" && <a href={`/api/connect/${p.id}`}>Reconnect</a>}
                        <form action={disconnect}>
                          <input type="hidden" name="accountId" value={a.id} />
                          <button className="link">Remove</button>
                        </form>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </>
  );
}
