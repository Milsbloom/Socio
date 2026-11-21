// Helpers for the REST API under /api/v1. Same actions as the MCP tools (see ai.ts).
import { userFromApiKey } from "./auth";
import { PostError } from "./posts";

type Handler<C> = (userId: number, req: Request, ctx: C) => Promise<unknown>;

/** Wraps a route: API key auth, JSON result, readable errors. */
export function api<C>(fn: Handler<C>) {
  return async (req: Request, ctx: C): Promise<Response> => {
    const userId = await userFromApiKey(req);
    if (!userId) return Response.json({ error: "Send a Socio API key as Authorization: Bearer <key>." }, { status: 401 });
    try {
      return Response.json(await fn(userId, req, ctx));
    } catch (e) {
      if (e instanceof PostError) return Response.json({ error: e.message }, { status: 400 });
      console.error(e);
      return Response.json({ error: "Something went wrong." }, { status: 500 });
    }
  };
}

export async function jsonBody<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new PostError("The request body must be JSON.");
  }
}

export function postId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new PostError("Post id must be a number.");
  return id;
}
