import { and, desc, eq, inArray, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Post, PostTarget, SocialAccount } from "@/db/schema";
import { getPlatform, PlatformError, type MediaFile, type PublishInput, type StatusResult } from "@/platforms";
import { accessToken, markNeedsReconnect } from "./accounts";
import { publicUrl, readStored } from "./media";
import { checkForPlatform } from "./validate";

export interface NewPost {
  userId: number;
  caption: string;
  mediaIds: number[];
  targets: { accountId: number; caption?: string }[];
  /** Absent: saved as a draft. */
  scheduledAt?: Date;
  createdBy: "user" | "ai";
}

export class PostError extends Error {}

async function loadMedia(userId: number, ids: number[]) {
  if (!ids.length) return [];
  const rows = await db
    .select()
    .from(schema.media)
    .where(and(eq(schema.media.userId, userId), inArray(schema.media.id, ids)));
  if (rows.length !== new Set(ids).size) throw new PostError("Some media files were not found.");
  // Keep the order the user chose.
  return ids.map((id) => rows.find((r) => r.id === id)!);
}

/** Creates a draft or scheduled post after checking it against every chosen platform's rules. */
export async function createPost(p: NewPost): Promise<number> {
  if (!p.targets.length) throw new PostError("Choose at least one account.");
  const media = await loadMedia(p.userId, p.mediaIds);
  const accounts = await db
    .select()
    .from(schema.socialAccounts)
    .where(
      and(
        eq(schema.socialAccounts.userId, p.userId),
        inArray(
          schema.socialAccounts.id,
          p.targets.map((t) => t.accountId),
        ),
      ),
    );

  const problems: string[] = [];
  for (const t of p.targets) {
    const acct = accounts.find((a) => a.id === t.accountId);
    const platform = acct && getPlatform(acct.platform);
    if (!acct || !platform) {
      problems.push(`Account ${t.accountId} was not found.`);
      continue;
    }
    problems.push(...checkForPlatform(platform, t.caption ?? p.caption, media).map((m) => `${acct.displayName}: ${m}`));
  }
  if (problems.length) throw new PostError(problems.join(" "));

  const [res] = await db.insert(schema.posts).values({
    userId: p.userId,
    caption: p.caption,
    mediaIds: p.mediaIds,
    status: p.scheduledAt ? "scheduled" : "draft",
    scheduledAt: p.scheduledAt ?? null,
    createdBy: p.createdBy,
  });
  const postId = res.insertId;
  await db.insert(schema.postTargets).values(
    p.targets.map((t) => ({
      postId,
      accountId: t.accountId,
      captionOverride: t.caption && t.caption !== p.caption ? t.caption : null,
    })),
  );
  return postId;
}

export async function getPost(userId: number, postId: number) {
  const [post] = await db
    .select()
    .from(schema.posts)
    .where(and(eq(schema.posts.id, postId), eq(schema.posts.userId, userId)))
    .limit(1);
  if (!post) return null;
  const targets = await db
    .select({ target: schema.postTargets, account: schema.socialAccounts })
    .from(schema.postTargets)
    .innerJoin(schema.socialAccounts, eq(schema.postTargets.accountId, schema.socialAccounts.id))
    .where(eq(schema.postTargets.postId, postId));
  return { post, targets };
}

export async function listPosts(userId: number, limit = 50) {
  const rows = await db
    .select()
    .from(schema.posts)
    .where(eq(schema.posts.userId, userId))
    .orderBy(desc(schema.posts.createdAt))
    .limit(limit);
  const out = [];
  for (const post of rows) out.push((await getPost(userId, post.id))!);
  return out;
}

/** Schedules a draft (or reschedules a scheduled post). */
export async function schedulePost(userId: number, postId: number, at: Date) {
  const res = await db
    .update(schema.posts)
    .set({ status: "scheduled", scheduledAt: at })
    .where(
      and(eq(schema.posts.id, postId), eq(schema.posts.userId, userId), inArray(schema.posts.status, ["draft", "scheduled"])),
    );
  if (!res[0].affectedRows) throw new PostError("Only drafts and scheduled posts can be scheduled.");
}

export async function cancelPost(userId: number, postId: number) {
  const res = await db
    .update(schema.posts)
    .set({ status: "cancelled" })
    .where(
      and(eq(schema.posts.id, postId), eq(schema.posts.userId, userId), inArray(schema.posts.status, ["draft", "scheduled"])),
    );
  if (!res[0].affectedRows) throw new PostError("Only drafts and scheduled posts can be cancelled.");
}

/** Publishes now: schedules for this moment, then runs the publisher right away. */
export async function publishNow(userId: number, postId: number) {
  await schedulePost(userId, postId, new Date());
  await publishPost(postId);
}

/** Puts failed platforms back in the queue and publishes again. */
export async function retryPost(userId: number, postId: number) {
  const found = await getPost(userId, postId);
  if (!found || found.post.status !== "failed") throw new PostError("Only failed posts can be retried.");
  await db
    .update(schema.postTargets)
    .set({ status: "pending", error: null })
    .where(and(eq(schema.postTargets.postId, postId), eq(schema.postTargets.status, "failed")));
  await db.update(schema.posts).set({ status: "scheduled", scheduledAt: new Date() }).where(eq(schema.posts.id, postId));
  await publishPost(postId);
}

async function buildInput(post: Post, target: PostTarget, acct: SocialAccount): Promise<PublishInput> {
  const rows = await loadMedia(post.userId, post.mediaIds);
  const media: MediaFile[] = rows.map((m) => ({
    kind: m.kind as "image" | "video",
    mimeType: m.mimeType,
    fileName: m.fileName,
    sizeBytes: m.sizeBytes,
    url: publicUrl(m.fileName),
    read: () => readStored(m.fileName),
  }));
  return {
    caption: target.captionOverride ?? post.caption,
    media,
    account: {
      externalId: acct.externalId,
      displayName: acct.displayName,
      accessToken: await accessToken(acct),
      meta: acct.meta ?? {},
    },
  };
}

async function record(target: PostTarget, result: StatusResult | { status: "failed"; error: string }) {
  const now = new Date();
  if (result.status === "failed") {
    await db.update(schema.postTargets).set({ status: "failed", error: result.error }).where(eq(schema.postTargets.id, target.id));
  } else if (result.status === "processing") {
    await db
      .update(schema.postTargets)
      .set({ status: "processing", remoteId: result.remoteId, meta: result.meta ?? {}, error: null })
      .where(eq(schema.postTargets.id, target.id));
  } else {
    await db
      .update(schema.postTargets)
      .set({ status: "published", remoteId: result.remoteId, remoteUrl: result.url ?? null, publishedAt: now, error: null })
      .where(eq(schema.postTargets.id, target.id));
  }
  await db.insert(schema.publishAttempts).values({
    targetId: target.id,
    ok: result.status !== "failed",
    message: result.status === "failed" ? result.error : result.status,
  });
}

/** Sets the post's overall status from its targets. */
async function settle(postId: number) {
  const targets = await db.select().from(schema.postTargets).where(eq(schema.postTargets.postId, postId));
  const status = targets.some((t) => t.status === "processing" || t.status === "pending")
    ? "publishing"
    : targets.every((t) => t.status === "published")
      ? "done"
      : "failed";
  await db.update(schema.posts).set({ status }).where(eq(schema.posts.id, postId));
}

/**
 * Publishes every pending platform of a due post. Claims the post first, so two cron runs
 * never publish the same post twice.
 */
export async function publishPost(postId: number) {
  const claim = await db
    .update(schema.posts)
    .set({ status: "publishing" })
    .where(and(eq(schema.posts.id, postId), eq(schema.posts.status, "scheduled"), lte(schema.posts.scheduledAt, new Date())));
  if (!claim[0].affectedRows) return;

  const [post] = await db.select().from(schema.posts).where(eq(schema.posts.id, postId));
  const rows = await db
    .select({ target: schema.postTargets, account: schema.socialAccounts })
    .from(schema.postTargets)
    .innerJoin(schema.socialAccounts, eq(schema.postTargets.accountId, schema.socialAccounts.id))
    .where(and(eq(schema.postTargets.postId, postId), eq(schema.postTargets.status, "pending")));

  // Platforms are independent, so publish to them side by side.
  await Promise.all(
    rows.map(async ({ target, account }) => {
      try {
        const platform = getPlatform(account.platform);
        if (!platform) throw new PlatformError(`Unknown platform ${account.platform}`);
        const result = await platform.publish(await buildInput(post, target, account));
        await record(target, result);
      } catch (e) {
        if (e instanceof PlatformError && e.needsReconnect) await markNeedsReconnect(account.id);
        await record(target, { status: "failed", error: (e as Error).message });
      }
    }),
  );
  await settle(postId);
}

/** Checks platforms still processing an upload (video on Instagram, TikTok, YouTube). */
export async function checkProcessing() {
  const rows = await db
    .select({ target: schema.postTargets, account: schema.socialAccounts, post: schema.posts })
    .from(schema.postTargets)
    .innerJoin(schema.socialAccounts, eq(schema.postTargets.accountId, schema.socialAccounts.id))
    .innerJoin(schema.posts, eq(schema.postTargets.postId, schema.posts.id))
    .where(eq(schema.postTargets.status, "processing"))
    .limit(20);
  const touched = new Set<number>();
  for (const { target, account, post } of rows) {
    const platform = getPlatform(account.platform);
    if (!platform?.checkStatus || !target.remoteId) continue;
    try {
      const result = await platform.checkStatus(await buildInput(post, target, account), target.remoteId, target.meta ?? {});
      if (result.status !== "processing") await record(target, result);
    } catch (e) {
      await record(target, { status: "failed", error: (e as Error).message });
    }
    touched.add(post.id);
  }
  for (const id of touched) await settle(id);
}

/** One cron tick: publish what's due, then check on uploads still processing. */
export async function runDue(): Promise<{ published: number }> {
  const due = await db
    .select({ id: schema.posts.id })
    .from(schema.posts)
    .where(and(eq(schema.posts.status, "scheduled"), lte(schema.posts.scheduledAt, new Date())))
    .limit(10);
  for (const { id } of due) await publishPost(id);
  await checkProcessing();
  return { published: due.length };
}
