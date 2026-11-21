"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createCode } from "@/lib/oauth";
import { checkAuthRequest } from "./request";

export async function decide(form: FormData) {
  const { uid } = await requireUser();
  const p = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
  const req = await checkAuthRequest(p);
  if ("error" in req) throw new Error(req.error);
  const back = new URL(req.redirectUri);
  if (p.decision === "allow") {
    back.searchParams.set("code", await createCode({ clientId: req.clientId, userId: uid, redirectUri: req.redirectUri, codeChallenge: req.codeChallenge }));
  } else {
    back.searchParams.set("error", "access_denied");
  }
  if (req.state) back.searchParams.set("state", req.state);
  redirect(back.toString());
}
