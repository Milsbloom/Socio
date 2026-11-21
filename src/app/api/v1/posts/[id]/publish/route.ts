import { aiPublishNow } from "@/lib/ai";
import { api, postId } from "@/lib/api";

export const maxDuration = 300;

export const POST = api<{ params: Promise<{ id: string }> }>(async (uid, _req, { params }) =>
  aiPublishNow(uid, postId((await params).id)),
);
