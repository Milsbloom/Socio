import { requireUser } from "@/lib/auth";
import { aiCanPublish } from "@/lib/ai";
import { appUrl } from "@/lib/env";
import { listApiKeys } from "@/lib/oauth";
import { revokeKey } from "./actions";
import { NewKeyForm } from "./new-key";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { uid } = await requireUser();
  const keys = await listApiKeys(uid);
  const base = appUrl();

  return (
    <>
      <h1>AI &amp; API</h1>

      <div className="card">
        <h2>Connect Claude</h2>
        <p>
          In Claude, open Settings, then Connectors, choose <strong>Add custom connector</strong>, and paste this URL.
          Claude will send you back here to approve it.
        </p>
        <p>
          <code>{base}/api/mcp</code>
        </p>
        <p className="muted small">
          Other AI tools that support MCP can use the same URL, either through the same sign-in or with an API key from below
          sent as <code>Authorization: Bearer &lt;key&gt;</code>.
        </p>
      </div>

      <div className="card">
        <h2>What AI tools may do</h2>
        {aiCanPublish() ? (
          <p>AI tools can create drafts, schedule and publish posts.</p>
        ) : (
          <p>
            AI tools can create drafts only. You review and publish them from the Posts page. To let them publish, set{" "}
            <code>AI_CAN_PUBLISH=true</code> in the hosting environment variables and restart the app.
          </p>
        )}
      </div>

      <div className="card">
        <h2>API keys and connections</h2>
        <p className="muted small">
          Keys work with the MCP URL above and with the REST API at <code>{base}/api/v1</code>. Claude connections appear here too.
        </p>
        {keys.length > 0 && (
          <ul className="targets">
            {keys.map((k) => (
              <li key={k.id} className="row" style={{ justifyContent: "space-between" }}>
                <span>
                  {k.name}
                  <span className="muted small">
                    {" "}
                    · {k.lastUsedAt ? `last used ${k.lastUsedAt.toLocaleString()}` : "never used"}
                  </span>
                </span>
                <form action={revokeKey}>
                  <input type="hidden" name="id" value={k.id} />
                  <button className="secondary">Revoke</button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <NewKeyForm />
      </div>
    </>
  );
}
