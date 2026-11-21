import { aiCancel, aiPostStatus } from "@/lib/ai";
import { api, postId } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

export const GET = api<Ctx>(async (uid, _req, { params }) => aiPostStatus(uid, postId((await params).id)));

/** Cancels a draft or scheduled post. */
export const DELETE = api<Ctx>(async (uid, _req, { params }) => aiCancel(uid, postId((await params).id)));
