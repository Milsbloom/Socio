import { callbackUrl, optionalEnv } from "@/lib/env";
import { call, expiresIn, PlatformError, type ConnectedAccount, type Platform, type StatusResult, type TokenSet } from "./types";

const API = "https://open.tiktokapis.com/v2";
const MB = 1024 * 1024;

async function tokenRequest(params: Record<string, string>): Promise<TokenSet & { openId: string }> {
  const res = await call(`${API}/oauth/token/`, {
    label: "TikTok token request",
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: optionalEnv("TIKTOK_CLIENT_KEY")!,
      client_secret: optionalEnv("TIKTOK_CLIENT_SECRET")!,
      ...params,
    }),
  });
  const j = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    open_id?: string;
    error?: string;
    error_description?: string;
  };
  if (!j.access_token) throw new PlatformError(`TikTok sign-in failed: ${j.error_description ?? j.error ?? "unknown error"}`);
  return { accessToken: j.access_token, refreshToken: j.refresh_token, expiresAt: expiresIn(j.expires_in), openId: j.open_id ?? "" };
}

/** TikTok wraps every response in { data, error }; error.code is "ok" on success. */
async function tiktok<T>(path: string, token: string, body: unknown, label: string): Promise<T> {
  const res = await call(`${API}${path}`, {
    label,
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify(body),
  });
  const j = (await res.json()) as { data: T; error?: { code: string; message: string } };
  if (j.error && j.error.code !== "ok") throw new PlatformError(`${label} failed: ${j.error.message || j.error.code}`);
  return j.data;
}

/**
 * TikTok's chunk rules: one chunk for files under 5 MB; otherwise chunks of 5 to 64 MB,
 * with the remainder folded into the last chunk.
 */
export function chunkPlan(size: number): { chunkSize: number; count: number } {
  if (size < 5 * MB) return { chunkSize: size, count: 1 };
  const chunkSize = Math.min(size, 10 * MB);
  return { chunkSize, count: Math.floor(size / chunkSize) };
}

export const tiktokPlatform: Platform = {
  id: "tiktok",
  label: "TikTok",
  captionLimit: 2200,
  maxImages: 0,
  requiresMedia: "video",
  pkce: false,
  configured: () => !!(optionalEnv("TIKTOK_CLIENT_KEY") && optionalEnv("TIKTOK_CLIENT_SECRET")),
  authorizeUrl(state) {
    const q = new URLSearchParams({
      client_key: optionalEnv("TIKTOK_CLIENT_KEY")!,
      scope: "user.info.basic,video.upload,video.publish",
      response_type: "code",
      redirect_uri: callbackUrl("tiktok"),
      state,
    });
    return `https://www.tiktok.com/v2/auth/authorize/?${q}`;
  },
  async exchange(code): Promise<ConnectedAccount[]> {
    const t = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: callbackUrl("tiktok") });
    const res = await call(`${API}/user/info/?fields=open_id,display_name`, {
      label: "TikTok profile lookup",
      headers: { Authorization: `Bearer ${t.accessToken}` },
    });
    const { data } = (await res.json()) as { data: { user: { open_id: string; display_name: string } } };
    return [
      {
        externalId: data.user.open_id || t.openId,
        displayName: data.user.display_name || "TikTok account",
        tokens: { accessToken: t.accessToken, refreshToken: t.refreshToken, expiresAt: t.expiresAt },
      },
    ];
  },
  async refresh(refreshToken) {
    const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
    return { accessToken: t.accessToken, refreshToken: t.refreshToken, expiresAt: t.expiresAt };
  },
  async publish(input) {
    const token = input.account.accessToken;
    const video = input.media.find((m) => m.kind === "video");
    if (!video) throw new PlatformError("TikTok needs a video.");

    // Until TikTok audits the app, it only allows private posts. Set TIKTOK_PRIVACY_LEVEL after the audit.
    const creator = await tiktok<{ privacy_level_options: string[] }>(
      "/post/publish/creator_info/query/",
      token,
      {},
      "TikTok account check",
    );
    const wanted = optionalEnv("TIKTOK_PRIVACY_LEVEL") ?? "SELF_ONLY";
    const privacy = creator.privacy_level_options.includes(wanted) ? wanted : "SELF_ONLY";

    const { chunkSize, count } = chunkPlan(video.sizeBytes);
    const init = await tiktok<{ publish_id: string; upload_url: string }>(
      "/post/publish/video/init/",
      token,
      {
        post_info: { title: input.caption, privacy_level: privacy, disable_duet: false, disable_comment: false, disable_stitch: false },
        source_info: { source: "FILE_UPLOAD", video_size: video.sizeBytes, chunk_size: chunkSize, total_chunk_count: count },
      },
      "TikTok upload start",
    );

    const bytes = await video.read();
    for (let i = 0; i < count; i++) {
      const start = i * chunkSize;
      const end = i === count - 1 ? bytes.length - 1 : start + chunkSize - 1;
      await call(init.upload_url, {
        label: "TikTok video upload",
        method: "PUT",
        headers: {
          "Content-Type": video.mimeType,
          "Content-Range": `bytes ${start}-${end}/${bytes.length}`,
        },
        body: new Uint8Array(bytes.subarray(start, end + 1)),
      });
    }
    return { status: "processing", remoteId: init.publish_id, meta: { privacy } };
  },
  async checkStatus(input, publishId): Promise<StatusResult> {
    const d = await tiktok<{ status: string; fail_reason?: string; publicaly_available_post_id?: string[] }>(
      "/post/publish/status/fetch/",
      input.account.accessToken,
      { publish_id: publishId },
      "TikTok status check",
    );
    if (d.status === "FAILED") return { status: "failed", error: `TikTok rejected the video: ${d.fail_reason ?? "unknown reason"}` };
    if (d.status !== "PUBLISH_COMPLETE") return { status: "processing", remoteId: publishId };
    const postId = d.publicaly_available_post_id?.[0];
    // Private posts have no public id, so there's no link to show.
    return { status: "published", remoteId: postId ?? publishId, url: postId ? `https://www.tiktok.com/video/${postId}` : undefined };
  },
};
