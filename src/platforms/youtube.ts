import { callbackUrl, optionalEnv } from "@/lib/env";
import { call, expiresIn, PlatformError, type ConnectedAccount, type Platform, type TokenSet } from "./types";

async function tokenRequest(params: Record<string, string>): Promise<TokenSet> {
  const res = await call("https://oauth2.googleapis.com/token", {
    label: "Google token request",
    method: "POST",
    body: new URLSearchParams({
      client_id: optionalEnv("GOOGLE_CLIENT_ID")!,
      client_secret: optionalEnv("GOOGLE_CLIENT_SECRET")!,
      ...params,
    }),
  });
  const j = (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number };
  return { accessToken: j.access_token, refreshToken: j.refresh_token, expiresAt: expiresIn(j.expires_in) };
}

/** YouTube titles max out at 100 characters and reject angle brackets. Uses the caption's first line. */
export function titleFrom(caption: string): string {
  const first = caption.split("\n").find((l) => l.trim())?.trim() ?? "";
  const clean = first.replace(/[<>]/g, "");
  if (!clean) return "New video";
  return [...clean].length > 100 ? `${[...clean].slice(0, 97).join("")}...` : clean;
}

export const youtube: Platform = {
  id: "youtube",
  label: "YouTube",
  captionLimit: 5000,
  maxImages: 0,
  requiresMedia: "video",
  pkce: true,
  configured: () => !!(optionalEnv("GOOGLE_CLIENT_ID") && optionalEnv("GOOGLE_CLIENT_SECRET")),
  authorizeUrl(state, codeChallenge) {
    const q = new URLSearchParams({
      client_id: optionalEnv("GOOGLE_CLIENT_ID")!,
      redirect_uri: callbackUrl("youtube"),
      response_type: "code",
      scope: "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly",
      access_type: "offline",
      // Always ask, so Google returns a refresh token even on a reconnect.
      prompt: "consent",
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
  },
  async exchange(code, codeVerifier): Promise<ConnectedAccount[]> {
    const tokens = await tokenRequest({
      code,
      code_verifier: codeVerifier,
      grant_type: "authorization_code",
      redirect_uri: callbackUrl("youtube"),
    });
    const res = await call("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
      label: "YouTube channel lookup",
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    const { items } = (await res.json()) as { items?: { id: string; snippet: { title: string } }[] };
    if (!items?.length) throw new PlatformError("This Google account has no YouTube channel.");
    return items.map((c) => ({ externalId: c.id, displayName: c.snippet.title, tokens }));
  },
  async refresh(refreshToken) {
    const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
    // Google doesn't send a new refresh token on refresh; keep the old one.
    return { ...t, refreshToken: t.refreshToken ?? refreshToken };
  },
  async publish(input) {
    const video = input.media.find((m) => m.kind === "video");
    if (!video) throw new PlatformError("YouTube needs a video.");
    const auth = { Authorization: `Bearer ${input.account.accessToken}` };

    // Resumable upload: first send the details, then the file to the address YouTube returns.
    const start = await call(
      "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
      {
        label: "YouTube upload start",
        method: "POST",
        headers: {
          ...auth,
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Length": String(video.sizeBytes),
          "X-Upload-Content-Type": video.mimeType,
        },
        body: JSON.stringify({
          snippet: { title: titleFrom(input.caption), description: input.caption.replace(/[<>]/g, ""), categoryId: "22" },
          // Unverified apps' uploads are forced to private by YouTube regardless of this setting.
          status: { privacyStatus: optionalEnv("YOUTUBE_PRIVACY") ?? "public", selfDeclaredMadeForKids: false },
        }),
      },
    );
    const location = start.headers.get("location");
    if (!location) throw new PlatformError("YouTube did not return an upload address.");

    const done = await call(location, {
      label: "YouTube video upload",
      method: "PUT",
      headers: { ...auth, "Content-Type": video.mimeType },
      body: new Uint8Array(await video.read()),
    });
    const { id } = (await done.json()) as { id: string };
    return { status: "published", remoteId: id, url: `https://www.youtube.com/watch?v=${id}` };
  },
};
