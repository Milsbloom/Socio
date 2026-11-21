import { aiSchedule } from "@/lib/ai";
import { api, jsonBody, postId } from "@/lib/api";

/** Body: { publish_at: "2026-12-01T09:00:00-05:00" } */
export const POST = api<{ params: Promise<{ id: string }> }>(async (uid, req, { params }) => {
  const { publish_at } = await jsonBody<{ publish_at?: string }>(req);
  return aiSchedule(uid, postId((await params).id), String(publish_at ?? ""));
});
