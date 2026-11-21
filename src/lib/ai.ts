// Actions available to AI tools (MCP server and REST API). Both call these, so they behave the same.
import { db, schema } from "@/db";
import { getPlatform } from "@/platforms";
import { accountHealth, listAccounts } from "./accounts";
import { kindOf, storeFile } from "./media";
import { cancelPost, createPost, getPost, listPosts, PostError, publishNow, schedulePost } from "./posts";

const MAX_DOWNLOAD = 300 * 1024 * 1024;

/** Whether AI tools may publish or schedule. Off by default: they can only create drafts for you to approve. */
export function aiCanPublish(): boolean {
  return process.env.AI_CAN_PUBLISH === "true";
}

function requirePublishRight() {
  if (!aiCanPublish()) {
    throw new PostError(
      "Publishing by AI tools is turned off. The post was kept as a draft; the owner can publish it from Socio's Posts page.",
    );
  }
}

export async function aiListAccounts(userId: number) {
  return (await listAccounts(userId)).map((a) => ({
    id: a.id,
    platform: a.platform,
    platform_name: getPlatform(a.platform)?.label ?? a.platform,
    name: a.displayName,
    health: accountHealth(a),
    caption_limit: getPlatform(a.platform)?.captionLimit,
  }));
}

/** Blocks links to the server itself or a private network. */
export function isPrivateHost(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  return h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80:");
}

/** Downloads media the AI points to (a public https link) into Socio's storage. */
async function fetchMedia(userId: number, url: string): Promise<number> {
  const u = new URL(url);
  if (u.protocol !== "https:") throw new PostError(`Media links must use https: ${url}`);
  if (isPrivateHost(u.hostname)) throw new PostError(`Media links must be public: ${url}`);
  const res = await fetch(u, { redirect: "manual" });
  if (res.status >= 300 && res.status < 400) throw new PostError(`${url} redirects elsewhere; give the final file link.`);
  if (!res.ok) throw new PostError(`Couldn't download ${url} (${res.status}).`);
  const mime = (res.headers.get("content-type") ?? "").split(";")[0].trim();
  const kind = kindOf(mime);
  if (!kind) throw new PostError(`${url} is ${mime || "an unknown type"}; only JPG, PNG, WebP, GIF, MP4, MOV and WebM work.`);
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > MAX_DOWNLOAD) throw new PostError(`${url} is larger than 300 MB.`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > MAX_DOWNLOAD) throw new PostError(`${url} is larger than 300 MB.`);
  const fileName = await storeFile(bytes, mime);
  const [row] = await db.insert(schema.media).values({ userId, kind, mimeType: mime, fileName, sizeBytes: bytes.length });
  return row.insertId;
}

export interface AiDraft {
  caption: string;
  account_ids: number[];
  captions_by_account?: Record<string, string>;
  media_urls?: string[];
}

export async function aiCreateDraft(userId: number, d: AiDraft) {
  const mediaIds: number[] = [];
  for (const url of d.media_urls ?? []) mediaIds.push(await fetchMedia(userId, url));
  const postId = await createPost({
    userId,
    caption: d.caption,
    mediaIds,
    targets: d.account_ids.map((accountId) => ({ accountId, caption: d.captions_by_account?.[String(accountId)] })),
    createdBy: "ai",
  });
  return aiPostStatus(userId, postId);
}

export async function aiSchedule(userId: number, postId: number, at: string) {
  requirePublishRight();
  const when = new Date(at);
  if (isNaN(when.getTime())) throw new PostError("publish_at must be an ISO 8601 date and time, with a time zone.");
  if (when.getTime() < Date.now() - 60_000) throw new PostError("publish_at is in the past.");
  await schedulePost(userId, postId, when);
  return aiPostStatus(userId, postId);
}

export async function aiPublishNow(userId: number, postId: number) {
  requirePublishRight();
  await publishNow(userId, postId);
  return aiPostStatus(userId, postId);
}

export async function aiCancel(userId: number, postId: number) {
  await cancelPost(userId, postId);
  return aiPostStatus(userId, postId);
}

export async function aiPostStatus(userId: number, postId: number) {
  const found = await getPost(userId, postId);
  if (!found) throw new PostError(`Post ${postId} was not found.`);
  const { post, targets } = found;
  return {
    id: post.id,
    status: post.status,
    caption: post.caption,
    scheduled_at: post.scheduledAt?.toISOString() ?? null,
    created_by: post.createdBy,
    media_count: post.mediaIds.length,
    platforms: targets.map(({ target, account }) => ({
      account_id: account.id,
      account: account.displayName,
      platform: account.platform,
      status: target.status,
      url: target.remoteUrl,
      error: target.error,
    })),
  };
}

export async function aiListPosts(userId: number, limit = 20) {
  const posts = await listPosts(userId, Math.min(Math.max(limit, 1), 50));
  return Promise.all(posts.map(({ post }) => aiPostStatus(userId, post.id)));
}
