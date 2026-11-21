import { requireUser } from "@/lib/auth";
import { aiCanPublish } from "@/lib/ai";
import { decide } from "./actions";
import { checkAuthRequest } from "./request";

export const dynamic = "force-dynamic";

const FIELDS = ["client_id", "redirect_uri", "response_type", "code_challenge", "code_challenge_method", "state"];

export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireUser();
  const q = await searchParams;
  const req = await checkAuthRequest(q);
  if ("error" in req) {
    return (
      <div className="card" style={{ maxWidth: 480, margin: "64px auto" }}>
        <h1>Can't connect</h1>
        <p className="notice error">{req.error}</p>
      </div>
    );
  }
  return (
    <div className="card" style={{ maxWidth: 480, margin: "64px auto" }}>
      <h1>Connect {req.clientName} to Socio?</h1>
      <p>It will be able to see your connected accounts and posts, and create drafts.</p>
      <p>
        {aiCanPublish()
          ? "AI publishing is on, so it can also publish and schedule posts."
          : "AI publishing is off, so anything it writes stays a draft until you publish it."}
      </p>
      <p className="muted small">Return address: {new URL(req.redirectUri).host}. You can disconnect it any time in Settings.</p>
      <form action={decide} className="row">
        {FIELDS.map((f) => q[f] !== undefined && <input key={f} type="hidden" name={f} value={q[f]} />)}
        <button name="decision" value="allow">Allow</button>
        <button name="decision" value="deny" className="secondary">Cancel</button>
      </form>
    </div>
  );
}
