import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  aiCanPublish,
  aiCancel,
  aiCreateDraft,
  aiListAccounts,
  aiListPosts,
  aiPostStatus,
  aiPublishNow,
  aiSchedule,
} from "./ai";
import { PostError } from "./posts";

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

/** Runs a tool body and turns its result, or a readable error, into MCP content. */
async function run(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return { content: [{ type: "text", text: JSON.stringify(await fn(), null, 2) }] };
  } catch (e) {
    const message = e instanceof PostError || e instanceof Error ? e.message : String(e);
    return { content: [{ type: "text", text: message }], isError: true };
  }
}

/** A fresh MCP server bound to one Socio user. Built per request (stateless). */
export function buildMcpServer(userId: number): McpServer {
  const server = new McpServer(
    { name: "socio", version: "0.1.0" },
    {
      instructions:
        "Socio publishes posts to the user's social accounts (Instagram, Facebook Pages, TikTok, YouTube, LinkedIn, X). " +
        "Call list_accounts first to get account ids. Create a draft with create_draft, then schedule_post or publish_now. " +
        (aiCanPublish()
          ? "Publishing is allowed. Confirm the caption and accounts with the user before publishing."
          : "Publishing by AI is turned off: create drafts only, and tell the user to review them in Socio."),
    },
  );

  server.registerTool(
    "list_accounts",
    {
      title: "List connected accounts",
      description: "Lists the social accounts connected to Socio, with ids, platform, caption length limit and health.",
      annotations: { readOnlyHint: true },
    },
    () => run(() => aiListAccounts(userId)),
  );

  server.registerTool(
    "create_draft",
    {
      title: "Create a draft post",
      description:
        "Creates a draft post for one or more accounts. Nothing is published yet. " +
        "Instagram needs an image or video (JPEG images only); TikTok and YouTube need exactly one video; X allows 280 characters.",
      inputSchema: {
        caption: z.string().describe("The post text."),
        account_ids: z.array(z.number().int()).min(1).describe("Account ids from list_accounts."),
        captions_by_account: z
          .record(z.string(), z.string())
          .optional()
          .describe("Optional different caption per account, keyed by account id."),
        media_urls: z
          .array(z.string().url())
          .max(10)
          .optional()
          .describe("Public https links to images or one video. Socio downloads them."),
      },
    },
    (args) => run(() => aiCreateDraft(userId, args)),
  );

  server.registerTool(
    "schedule_post",
    {
      title: "Schedule a post",
      description: "Schedules a draft (or reschedules a scheduled post) to publish at a set time.",
      inputSchema: {
        post_id: z.number().int(),
        publish_at: z.string().describe("ISO 8601 date and time with a time zone, e.g. 2026-12-01T09:00:00-05:00."),
      },
      annotations: { destructiveHint: false, openWorldHint: true },
    },
    ({ post_id, publish_at }) => run(() => aiSchedule(userId, post_id, publish_at)),
  );

  server.registerTool(
    "publish_now",
    {
      title: "Publish a post now",
      description: "Publishes a draft immediately to all of its accounts and returns the result for each.",
      inputSchema: { post_id: z.number().int() },
      annotations: { openWorldHint: true },
    },
    ({ post_id }) => run(() => aiPublishNow(userId, post_id)),
  );

  server.registerTool(
    "list_posts",
    {
      title: "List posts",
      description: "Lists recent drafts, scheduled and published posts, newest first.",
      inputSchema: { limit: z.number().int().min(1).max(50).optional() },
      annotations: { readOnlyHint: true },
    },
    ({ limit }) => run(() => aiListPosts(userId, limit ?? 20)),
  );

  server.registerTool(
    "get_post_status",
    {
      title: "Get a post's status",
      description: "Shows a post's result on each platform: published with a link, still processing, or failed with the reason.",
      inputSchema: { post_id: z.number().int() },
      annotations: { readOnlyHint: true },
    },
    ({ post_id }) => run(() => aiPostStatus(userId, post_id)),
  );

  server.registerTool(
    "cancel_post",
    {
      title: "Cancel a post",
      description: "Cancels a draft or scheduled post so it never publishes.",
      inputSchema: { post_id: z.number().int() },
    },
    ({ post_id }) => run(() => aiCancel(userId, post_id)),
  );

  return server;
}
