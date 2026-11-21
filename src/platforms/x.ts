import { callbackUrl, optionalEnv } from "@/lib/env";
import {
  call,
  expiresIn,
  form,
  PlatformError,
  type ConnectedAccount,
  type MediaFile,
  type Platform,
  type TokenSet,
} from "./types";

const API = "https://api.x.com/2";
const CHUNK = 4 * 1024 * 1024;

function basicAuth() {
  const id = optionalEnv("X_CLIENT_ID")!;
  const secret = optionalEnv("X_CLIENT_SECRET")!;
  return `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
}

async function tokenRequest(params: Record<string, string>): Promise<TokenSet> {
  const res = await call(`${API}/oauth2/token`, {
    label: "X token request",
    method: "POST",
    headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded" },
    body: form(params),
  });
  const j = (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number };
  return { accessToken: j.access_token, refreshToken: j.refresh_token, expiresAt: expiresIn(j.expires_in) };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function uploadImage(file: MediaFile, tok: string): Promise<string> {
  const body = new FormData();
  body.append("media", new Blob([new Uint8Array(await file.read())], { type: file.mimeType }), file.fileName);
  body.append("media_category", "tweet_image");
  const res = await call(`${API}/media/upload`, {
    label: "X image upload",
    method: "POST",
    headers: { Authorization: `Bearer ${tok}` },
    body,
  });
  const { data } = (await res.json()) as { data: { id: string } };
  return data.id;
}

async function uploadVideo(file: MediaFile, tok: string): Promise<string> {
  const auth = { Authorization: `Bearer ${tok}` };
  const init = await call(`${API}/media/upload/initialize`, {
    label: "X video upload start",
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ media_type: file.mimeType, total_bytes: file.sizeBytes, media_category: "tweet_video" }),
  });
  const id = ((await init.json()) as { data: { id: string } }).data.id;

  const bytes = await file.read();
  for (let i = 0, seg = 0; i < bytes.length; i += CHUNK, seg++) {
    const body = new FormData();
    body.append("media", new Blob([new Uint8Array(bytes.subarray(i, i + CHUNK))]), "chunk");
    body.append("segment_index", String(seg));
    await call(`${API}/media/upload/${id}/append`, { label: "X video upload part", method: "POST", headers: auth, body });
  }

  const fin = await call(`${API}/media/upload/${id}/finalize`, { label: "X video upload finish", method: "POST", headers: auth });
  let info = ((await fin.json()) as { data: { processing_info?: { state: string; check_after_secs?: number } } }).data
    .processing_info;

  // Wait for X to finish processing the video (usually under a minute) before attaching it to a post.
  for (let tries = 0; info && info.state !== "succeeded" && tries < 20; tries++) {
    if (info.state === "failed") throw new PlatformError("X could not process the video");
    await sleep((info.check_after_secs ?? 3) * 1000);
    const st = await call(`${API}/media/upload?command=STATUS&media_id=${id}`, { label: "X video status", headers: auth });
    info = ((await st.json()) as { data: { processing_info?: { state: string; check_after_secs?: number } } }).data
      .processing_info;
  }
  if (info && info.state !== "succeeded") throw new PlatformError("X is still processing the video; try again shortly");
  return id;
}

export const x: Platform = {
  id: "x",
  label: "X",
  captionLimit: 280,
  maxImages: 4,
  pkce: true,
  configured: () => !!(optionalEnv("X_CLIENT_ID") && optionalEnv("X_CLIENT_SECRET")),
  authorizeUrl(state, codeChallenge) {
    const q = new URLSearchParams({
      response_type: "code",
      client_id: optionalEnv("X_CLIENT_ID")!,
      redirect_uri: callbackUrl("x"),
      scope: "tweet.read tweet.write users.read media.write offline.access",
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });
    return `https://x.com/i/oauth2/authorize?${q}`;
  },
  async exchange(code, codeVerifier): Promise<ConnectedAccount[]> {
    const tokens = await tokenRequest({
      grant_type: "authorization_code",
      code,
      redirect_uri: callbackUrl("x"),
      code_verifier: codeVerifier,
    });
    const res = await call(`${API}/users/me`, {
      label: "X profile lookup",
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    const { data } = (await res.json()) as { data: { id: string; name: string; username: string } };
    return [{ externalId: data.id, displayName: `@${data.username}`, tokens, meta: { username: data.username } }];
  },
  refresh: (refreshToken) => tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken }),
  async publish(input) {
    const tok = input.account.accessToken;
    const video = input.media.find((m) => m.kind === "video");
    const mediaIds = video
      ? [await uploadVideo(video, tok)]
      : await Promise.all(input.media.filter((m) => m.kind === "image").map((m) => uploadImage(m, tok)));

    const res = await call(`${API}/tweets`, {
      label: "X post",
      method: "POST",
      headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text: input.caption, ...(mediaIds.length ? { media: { media_ids: mediaIds } } : {}) }),
    });
    const { data } = (await res.json()) as { data: { id: string } };
    const username = input.account.meta.username as string | undefined;
    return {
      status: "published",
      remoteId: data.id,
      url: username ? `https://x.com/${username}/status/${data.id}` : undefined,
    };
  },
};
