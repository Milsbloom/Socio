import { aiCreateDraft, aiListPosts, type AiDraft } from "@/lib/ai";
import { api, jsonBody } from "@/lib/api";
import { PostError } from "@/lib/posts";

export const maxDuration = 300;

export const GET = api((uid, req) => aiListPosts(uid, Number(new URL(req.url).searchParams.get("limit") ?? 20) || 20));

/** Creates a draft. Body: { caption, account_ids, captions_by_account?, media_urls? } */
export const POST = api(async (uid, req) => {
  const d = await jsonBody<AiDraft>(req);
  if (typeof d.caption !== "string") throw new PostError("caption is required.");
  if (!Array.isArray(d.account_ids) || !d.account_ids.length || !d.account_ids.every(Number.isInteger)) {
    throw new PostError("account_ids must be a list of account ids.");
  }
  if (d.media_urls !== undefined && (!Array.isArray(d.media_urls) || d.media_urls.length > 10)) {
    throw new PostError("media_urls must be a list of up to 10 links.");
  }
  return aiCreateDraft(uid, d);
});
