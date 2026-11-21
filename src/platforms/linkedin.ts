import { callbackUrl, optionalEnv } from "@/lib/env";
import {
  call,
  expiresIn,
  form,
  PlatformError,
  type ConnectedAccount,
  type MediaFile,
  type Platform,
  type PublishInput,
  type TokenSet,
} from "./types";

// LinkedIn's versioned REST API. Versions are supported for about a year; bump when LinkedIn retires this one.
const VERSION = "202510";
const API = "https://api.linkedin.com/rest";

function headers(token: string, extra: Record<string, string> = {}) {
  return {
    Authorization: `Bearer ${token}`,
    "LinkedIn-Version": VERSION,
    "X-Restli-Protocol-Version": "2.0.0",
    ...extra,
  };
}

/**
 * LinkedIn's "little text" format treats some characters as markup, and unescaped ones can cut a post short.
 * Escapes them, and turns #words into real hashtags.
 */
export function toLittleText(text: string): string {
  const escaped = text.replace(/[\\|{}@[\]()<>*_~]/g, (c) => `\\${c}`);
  return escaped.replace(/#(\w+)/gu, (_m, tag: string) => `{hashtag|\\#|${tag}}`);
}

async function token(code: string, clientId: string, clientSecret: string, platform: string): Promise<TokenSet> {
  const res = await call("https://www.linkedin.com/oauth/v2/accessToken", {
    label: "LinkedIn token exchange",
    method: "POST",
    body: form({
      grant_type: "authorization_code",
      code,
      redirect_uri: callbackUrl(platform),
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  const j = (await res.json()) as { access_token: string; expires_in?: number; refresh_token?: string };
  return { accessToken: j.access_token, refreshToken: j.refresh_token, expiresAt: expiresIn(j.expires_in) };
}

async function uploadImage(file: MediaFile, owner: string, tok: string): Promise<string> {
  const init = await call(`${API}/images?action=initializeUpload`, {
    label: "LinkedIn image upload start",
    method: "POST",
    headers: headers(tok, { "Content-Type": "application/json" }),
    body: JSON.stringify({ initializeUploadRequest: { owner } }),
  });
  const { value } = (await init.json()) as { value: { uploadUrl: string; image: string } };
  await call(value.uploadUrl, {
    label: "LinkedIn image upload",
    method: "PUT",
    headers: { Authorization: `Bearer ${tok}`, "Content-Type": file.mimeType },
    body: new Uint8Array(await file.read()),
  });
  return value.image;
}

async function uploadVideo(file: MediaFile, owner: string, tok: string): Promise<string> {
  const init = await call(`${API}/videos?action=initializeUpload`, {
    label: "LinkedIn video upload start",
    method: "POST",
    headers: headers(tok, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      initializeUploadRequest: { owner, fileSizeBytes: file.sizeBytes, uploadCaptions: false, uploadThumbnail: false },
    }),
  });
  const { value } = (await init.json()) as {
    value: {
      video: string;
      uploadToken: string;
      uploadInstructions: { uploadUrl: string; firstByte: number; lastByte: number }[];
    };
  };
  const bytes = await file.read();
  const etags: string[] = [];
  for (const part of value.uploadInstructions) {
    const res = await call(part.uploadUrl, {
      label: "LinkedIn video part upload",
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: new Uint8Array(bytes.subarray(part.firstByte, part.lastByte + 1)),
    });
    const etag = res.headers.get("etag");
    if (!etag) throw new PlatformError("LinkedIn video upload returned no part id");
    etags.push(etag);
  }
  await call(`${API}/videos?action=finalizeUpload`, {
    label: "LinkedIn video upload finish",
    method: "POST",
    headers: headers(tok, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      finalizeUploadRequest: { video: value.video, uploadToken: value.uploadToken, uploadedPartIds: etags },
    }),
  });
  return value.video;
}

/** Shared by personal profiles and company pages; only the author differs. */
async function publishAs(author: string, input: PublishInput) {
  const tok = input.account.accessToken;
  const images = input.media.filter((m) => m.kind === "image");
  const video = input.media.find((m) => m.kind === "video");

  let content: Record<string, unknown> | undefined;
  if (video) {
    content = { media: { id: await uploadVideo(video, author, tok) } };
  } else if (images.length === 1) {
    content = { media: { id: await uploadImage(images[0], author, tok) } };
  } else if (images.length > 1) {
    const ids: string[] = [];
    for (const img of images) ids.push(await uploadImage(img, author, tok));
    content = { multiImage: { images: ids.map((id) => ({ id })) } };
  }

  const res = await call(`${API}/posts`, {
    label: "LinkedIn post",
    method: "POST",
    headers: headers(tok, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      author,
      commentary: toLittleText(input.caption),
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
      ...(content ? { content } : {}),
    }),
  });
  const urn = res.headers.get("x-restli-id") ?? "";
  return {
    status: "published" as const,
    remoteId: urn,
    url: urn ? `https://www.linkedin.com/feed/update/${urn}/` : undefined,
  };
}

const common = {
  captionLimit: 3000,
  maxImages: 20,
  pkce: false,
} as const;

export const linkedin: Platform = {
  ...common,
  id: "linkedin",
  label: "LinkedIn profile",
  configured: () => !!(optionalEnv("LINKEDIN_CLIENT_ID") && optionalEnv("LINKEDIN_CLIENT_SECRET")),
  authorizeUrl(state) {
    const q = new URLSearchParams({
      response_type: "code",
      client_id: optionalEnv("LINKEDIN_CLIENT_ID")!,
      redirect_uri: callbackUrl("linkedin"),
      state,
      scope: "openid profile w_member_social",
    });
    return `https://www.linkedin.com/oauth/v2/authorization?${q}`;
  },
  async exchange(code): Promise<ConnectedAccount[]> {
    const tokens = await token(code, optionalEnv("LINKEDIN_CLIENT_ID")!, optionalEnv("LINKEDIN_CLIENT_SECRET")!, "linkedin");
    const res = await call("https://api.linkedin.com/v2/userinfo", {
      label: "LinkedIn profile lookup",
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    const me = (await res.json()) as { sub: string; name?: string };
    return [{ externalId: `urn:li:person:${me.sub}`, displayName: me.name ?? "LinkedIn profile", tokens }];
  },
  publish: (input) => publishAs(input.account.externalId, input),
};

export const linkedinPages: Platform = {
  ...common,
  id: "linkedin-pages",
  label: "LinkedIn company page",
  configured: () => !!(optionalEnv("LINKEDIN_PAGES_CLIENT_ID") && optionalEnv("LINKEDIN_PAGES_CLIENT_SECRET")),
  authorizeUrl(state) {
    const q = new URLSearchParams({
      response_type: "code",
      client_id: optionalEnv("LINKEDIN_PAGES_CLIENT_ID")!,
      redirect_uri: callbackUrl("linkedin-pages"),
      state,
      scope: "w_organization_social r_organization_social rw_organization_admin",
    });
    return `https://www.linkedin.com/oauth/v2/authorization?${q}`;
  },
  async exchange(code): Promise<ConnectedAccount[]> {
    const tokens = await token(
      code,
      optionalEnv("LINKEDIN_PAGES_CLIENT_ID")!,
      optionalEnv("LINKEDIN_PAGES_CLIENT_SECRET")!,
      "linkedin-pages",
    );
    const res = await call(`${API}/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED`, {
      label: "LinkedIn page list",
      headers: headers(tokens.accessToken),
    });
    const { elements } = (await res.json()) as { elements: { organization: string }[] };
    const accounts: ConnectedAccount[] = [];
    for (const { organization } of elements) {
      const id = organization.split(":").pop();
      const org = await call(`${API}/organizations/${id}`, {
        label: "LinkedIn page lookup",
        headers: headers(tokens.accessToken),
      });
      const { localizedName } = (await org.json()) as { localizedName?: string };
      accounts.push({ externalId: organization, displayName: localizedName ?? organization, tokens });
    }
    if (!accounts.length) throw new PlatformError("No LinkedIn company pages found where you are an admin.");
    return accounts;
  },
  publish: (input) => publishAs(input.account.externalId, input),
};
