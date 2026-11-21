import { callbackUrl, optionalEnv } from "@/lib/env";
import {
  call,
  expiresIn,
  PlatformError,
  type ConnectedAccount,
  type MediaFile,
  type Platform,
  type PublishResult,
  type StatusResult,
  type TokenSet,
} from "./types";

// Meta's Graph API version. Each version is supported for about two years.
const VERSION = "v23.0";
const IG = `https://graph.instagram.com/${VERSION}`;
const FB = `https://graph.facebook.com/${VERSION}`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

// ---------------------------------------------------------------- Instagram

/** Instagram tokens last 60 days and are refreshed by presenting the token itself. */
async function igRefresh(token: string): Promise<TokenSet> {
  const q = new URLSearchParams({ grant_type: "ig_refresh_token", access_token: token });
  const j = await json<{ access_token: string; expires_in: number }>(
    await call(`https://graph.instagram.com/refresh_access_token?${q}`, { label: "Instagram token refresh" }),
  );
  return { accessToken: j.access_token, refreshToken: j.access_token, expiresAt: expiresIn(j.expires_in) };
}

/** Creates a media container. Instagram downloads the media from our public link. */
async function igContainer(userId: string, token: string, params: Record<string, string>): Promise<string> {
  const j = await json<{ id: string }>(
    await call(`${IG}/${userId}/media`, {
      label: "Instagram media upload",
      method: "POST",
      body: new URLSearchParams({ ...params, access_token: token }),
    }),
  );
  return j.id;
}

async function igContainerStatus(id: string, token: string): Promise<string> {
  const q = new URLSearchParams({ fields: "status_code,status", access_token: token });
  const j = await json<{ status_code: string; status?: string }>(
    await call(`${IG}/${id}?${q}`, { label: "Instagram media status" }),
  );
  if (j.status_code === "ERROR" || j.status_code === "EXPIRED") {
    throw new PlatformError(`Instagram could not process the media: ${j.status ?? j.status_code}`);
  }
  return j.status_code; // IN_PROGRESS | FINISHED | PUBLISHED
}

async function igWaitReady(id: string, token: string, tries = 10) {
  for (let i = 0; i < tries; i++) {
    if ((await igContainerStatus(id, token)) === "FINISHED") return;
    await sleep(2000);
  }
  throw new PlatformError("Instagram is still processing the image; try again shortly");
}

async function igPublish(userId: string, token: string, containerId: string): Promise<PublishResult> {
  const { id } = await json<{ id: string }>(
    await call(`${IG}/${userId}/media_publish`, {
      label: "Instagram publish",
      method: "POST",
      body: new URLSearchParams({ creation_id: containerId, access_token: token }),
    }),
  );
  const q = new URLSearchParams({ fields: "permalink", access_token: token });
  const { permalink } = await json<{ permalink?: string }>(await call(`${IG}/${id}?${q}`, { label: "Instagram link lookup" }));
  return { status: "published", remoteId: id, url: permalink };
}

export const instagram: Platform = {
  id: "instagram",
  label: "Instagram",
  captionLimit: 2200,
  maxImages: 10,
  imageTypes: ["image/jpeg"],
  requiresMedia: "any",
  pkce: false,
  configured: () => !!(optionalEnv("INSTAGRAM_APP_ID") && optionalEnv("INSTAGRAM_APP_SECRET")),
  authorizeUrl(state) {
    const q = new URLSearchParams({
      client_id: optionalEnv("INSTAGRAM_APP_ID")!,
      redirect_uri: callbackUrl("instagram"),
      response_type: "code",
      scope: "instagram_business_basic,instagram_business_content_publish",
      state,
    });
    return `https://www.instagram.com/oauth/authorize?${q}`;
  },
  async exchange(code): Promise<ConnectedAccount[]> {
    const short = await json<{ access_token: string }>(
      await call("https://api.instagram.com/oauth/access_token", {
        label: "Instagram token exchange",
        method: "POST",
        body: new URLSearchParams({
          client_id: optionalEnv("INSTAGRAM_APP_ID")!,
          client_secret: optionalEnv("INSTAGRAM_APP_SECRET")!,
          grant_type: "authorization_code",
          redirect_uri: callbackUrl("instagram"),
          code: code.replace(/#_$/, ""),
        }),
      }),
    );
    // Swap the 1-hour token for a 60-day one.
    const q = new URLSearchParams({
      grant_type: "ig_exchange_token",
      client_secret: optionalEnv("INSTAGRAM_APP_SECRET")!,
      access_token: short.access_token,
    });
    const long = await json<{ access_token: string; expires_in: number }>(
      await call(`https://graph.instagram.com/access_token?${q}`, { label: "Instagram long-lived token" }),
    );
    const me = await json<{ user_id: string; username: string }>(
      await call(`${IG}/me?${new URLSearchParams({ fields: "user_id,username", access_token: long.access_token })}`, {
        label: "Instagram profile lookup",
      }),
    );
    return [
      {
        externalId: me.user_id,
        displayName: `@${me.username}`,
        tokens: { accessToken: long.access_token, refreshToken: long.access_token, expiresAt: expiresIn(long.expires_in) },
      },
    ];
  },
  refresh: igRefresh,
  async publish(input) {
    const { externalId: userId, accessToken: token } = input.account;
    const video = input.media.find((m) => m.kind === "video");
    const images = input.media.filter((m) => m.kind === "image");

    if (video) {
      // Videos post as Reels. Processing takes a while, so the cron job finishes the publish later.
      const id = await igContainer(userId, token, { media_type: "REELS", video_url: video.url, caption: input.caption });
      return { status: "processing", remoteId: id, meta: { step: "container" } };
    }
    if (images.length === 1) {
      const id = await igContainer(userId, token, { image_url: images[0].url, caption: input.caption });
      await igWaitReady(id, token);
      return igPublish(userId, token, id);
    }
    const children: string[] = [];
    for (const img of images) children.push(await igContainer(userId, token, { image_url: img.url, is_carousel_item: "true" }));
    for (const c of children) await igWaitReady(c, token);
    const id = await igContainer(userId, token, { media_type: "CAROUSEL", children: children.join(","), caption: input.caption });
    await igWaitReady(id, token);
    return igPublish(userId, token, id);
  },
  async checkStatus(input, remoteId): Promise<StatusResult> {
    const { externalId: userId, accessToken: token } = input.account;
    try {
      const status = await igContainerStatus(remoteId, token);
      if (status !== "FINISHED") return { status: "processing", remoteId };
      return await igPublish(userId, token, remoteId);
    } catch (e) {
      return { status: "failed", error: (e as Error).message };
    }
  },
};

// ---------------------------------------------------------------- Facebook Pages

async function fbUpload(path: string, token: string, file: MediaFile, fields: Record<string, string>) {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.append(k, v);
  body.append("access_token", token);
  body.append("source", new Blob([new Uint8Array(await file.read())], { type: file.mimeType }), file.fileName);
  return json<{ id: string; post_id?: string }>(await call(`${FB}/${path}`, { label: "Facebook upload", method: "POST", body }));
}

export const facebook: Platform = {
  id: "facebook",
  label: "Facebook Page",
  captionLimit: 63206,
  maxImages: 10,
  pkce: false,
  configured: () => !!(optionalEnv("META_APP_ID") && optionalEnv("META_APP_SECRET")),
  authorizeUrl(state) {
    const q = new URLSearchParams({
      client_id: optionalEnv("META_APP_ID")!,
      redirect_uri: callbackUrl("facebook"),
      state,
      scope: "pages_show_list,pages_read_engagement,pages_manage_posts",
      response_type: "code",
    });
    return `https://www.facebook.com/${VERSION}/dialog/oauth?${q}`;
  },
  async exchange(code): Promise<ConnectedAccount[]> {
    const id = optionalEnv("META_APP_ID")!;
    const secret = optionalEnv("META_APP_SECRET")!;
    const short = await json<{ access_token: string }>(
      await call(
        `${FB}/oauth/access_token?${new URLSearchParams({ client_id: id, client_secret: secret, redirect_uri: callbackUrl("facebook"), code })}`,
        { label: "Facebook token exchange" },
      ),
    );
    // A long-lived user token gives Page tokens that don't expire.
    const long = await json<{ access_token: string }>(
      await call(
        `${FB}/oauth/access_token?${new URLSearchParams({ grant_type: "fb_exchange_token", client_id: id, client_secret: secret, fb_exchange_token: short.access_token })}`,
        { label: "Facebook long-lived token" },
      ),
    );
    const pages = await json<{ data: { id: string; name: string; access_token: string }[] }>(
      await call(`${FB}/me/accounts?${new URLSearchParams({ fields: "id,name,access_token", access_token: long.access_token })}`, {
        label: "Facebook Page list",
      }),
    );
    if (!pages.data.length) throw new PlatformError("No Facebook Pages found. Make sure you chose your Page when approving.");
    return pages.data.map((p) => ({ externalId: p.id, displayName: p.name, tokens: { accessToken: p.access_token } }));
  },
  async publish(input) {
    const { externalId: pageId, accessToken: token } = input.account;
    const video = input.media.find((m) => m.kind === "video");
    const images = input.media.filter((m) => m.kind === "image");

    if (video) {
      const { id } = await fbUpload(`${pageId}/videos`, token, video, { description: input.caption });
      return { status: "published", remoteId: id, url: `https://www.facebook.com/${pageId}/videos/${id}` };
    }
    if (images.length === 1) {
      const r = await fbUpload(`${pageId}/photos`, token, images[0], { caption: input.caption });
      const postId = r.post_id ?? r.id;
      return { status: "published", remoteId: postId, url: `https://www.facebook.com/${postId}` };
    }
    const fields: Record<string, string> = { message: input.caption, access_token: token };
    if (images.length > 1) {
      // Upload each photo unpublished, then attach them all to one post.
      for (const [i, img] of images.entries()) {
        const { id } = await fbUpload(`${pageId}/photos`, token, img, { published: "false" });
        fields[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id });
      }
    }
    const { id } = await json<{ id: string }>(
      await call(`${FB}/${pageId}/feed`, { label: "Facebook post", method: "POST", body: new URLSearchParams(fields) }),
    );
    return { status: "published", remoteId: id, url: `https://www.facebook.com/${id}` };
  },
};
