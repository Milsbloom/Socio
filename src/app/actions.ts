"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { endSession, requireUser, startSession } from "@/lib/auth";
import { verifyPassword } from "@/lib/crypto";
import { kindOf, storeFile } from "@/lib/media";
import { cancelPost, createPost, PostError, publishNow, retryPost } from "@/lib/posts";

export type FormState = { error?: string; ok?: string };

export async function login(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (!user || !(await verifyPassword(password, user.passwordHash))) return { error: "Wrong email or password." };
  await startSession(user.id);
  redirect("/posts");
}

export async function logout() {
  await endSession();
  redirect("/login");
}

/** Composer submit: stores uploads, creates the post, and publishes or schedules it. */
export async function submitPost(_: FormState, form: FormData): Promise<FormState> {
  const { uid } = await requireUser();
  const caption = String(form.get("caption") ?? "");
  const mode = String(form.get("mode") ?? "draft"); // now | schedule | draft
  const accountIds = form.getAll("account").map(Number).filter(Boolean);
  const targets = accountIds.map((accountId) => {
    const override = form.get(`caption_${accountId}`);
    return { accountId, caption: override ? String(override) : undefined };
  });

  let scheduledAt: Date | undefined;
  if (mode === "schedule") {
    // The browser sends the chosen local time converted to ISO (UTC).
    scheduledAt = new Date(String(form.get("scheduledAtIso") ?? ""));
    if (isNaN(scheduledAt.getTime())) return { error: "Pick a date and time." };
    if (scheduledAt.getTime() < Date.now() - 60_000) return { error: "That time is in the past." };
  }

  try {
    const mediaIds: number[] = [];
    for (const f of form.getAll("media")) {
      if (!(f instanceof File) || f.size === 0) continue;
      const kind = kindOf(f.type);
      if (!kind) return { error: `${f.name}: only JPG, PNG, WebP, GIF, MP4, MOV and WebM files are supported.` };
      const fileName = await storeFile(Buffer.from(await f.arrayBuffer()), f.type);
      const [res] = await db
        .insert(schema.media)
        .values({ userId: uid, kind, mimeType: f.type, fileName, sizeBytes: f.size });
      mediaIds.push(res.insertId);
    }

    const postId = await createPost({ userId: uid, caption, mediaIds, targets, scheduledAt, createdBy: "user" });
    if (mode === "now") await publishNow(uid, postId);
  } catch (e) {
    if (e instanceof PostError) return { error: e.message };
    throw e;
  }
  revalidatePath("/posts");
  redirect("/posts");
}

export async function retry(form: FormData) {
  const { uid } = await requireUser();
  await retryPost(uid, Number(form.get("postId")));
  revalidatePath("/posts");
}

export async function cancel(form: FormData) {
  const { uid } = await requireUser();
  await cancelPost(uid, Number(form.get("postId")));
  revalidatePath("/posts");
}

export async function publishDraft(form: FormData) {
  const { uid } = await requireUser();
  await publishNow(uid, Number(form.get("postId")));
  revalidatePath("/posts");
}

export async function disconnect(form: FormData) {
  const { uid } = await requireUser();
  await db
    .delete(schema.socialAccounts)
    .where(and(eq(schema.socialAccounts.id, Number(form.get("accountId"))), eq(schema.socialAccounts.userId, uid)));
  revalidatePath("/accounts");
}
