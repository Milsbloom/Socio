export type PlatformId = "linkedin" | "linkedin-pages" | "x" | "instagram" | "facebook" | "tiktok" | "youtube";

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
}

/** One account found after an OAuth sign-in. LinkedIn Pages can return several. */
export interface ConnectedAccount {
  externalId: string;
  displayName: string;
  tokens: TokenSet;
  meta?: Record<string, unknown>;
}

export interface MediaFile {
  kind: "image" | "video";
  mimeType: string;
  fileName: string;
  sizeBytes: number;
  url: string; // public link
  read(): Promise<Buffer>;
}

export interface PublishInput {
  caption: string;
  media: MediaFile[];
  account: { externalId: string; displayName: string; accessToken: string; meta: Record<string, unknown> };
}

export type PublishResult =
  | { status: "published"; remoteId: string; url?: string }
  // The platform accepted the post but is still processing it (usually video). Checked again later.
  | { status: "processing"; remoteId: string; meta?: Record<string, unknown> };

export type StatusResult = PublishResult | { status: "failed"; error: string };

export interface Platform {
  id: PlatformId;
  label: string;
  /** Maximum caption length in characters. */
  captionLimit: number;
  /** "video": must have exactly one video. "any": must have at least one image or video. */
  requiresMedia?: "video" | "any";
  maxImages: number;
  /** When set, the only image types this platform accepts. */
  imageTypes?: string[];
  /** True when this platform's app keys are present in the environment. */
  configured(): boolean;
  /** Whether the sign-in uses PKCE. */
  pkce: boolean;
  authorizeUrl(state: string, codeChallenge: string): string;
  exchange(code: string, codeVerifier: string): Promise<ConnectedAccount[]>;
  refresh?(refreshToken: string): Promise<TokenSet>;
  publish(input: PublishInput): Promise<PublishResult>;
  checkStatus?(input: PublishInput, remoteId: string, meta: Record<string, unknown>): Promise<StatusResult>;
}

export class PlatformError extends Error {
  constructor(
    message: string,
    /** True when the account must be reconnected (token revoked or expired). */
    public readonly needsReconnect = false,
  ) {
    super(message);
  }
}

/** fetch() that throws a readable PlatformError on a non-2xx response. */
export async function call(url: string, init: RequestInit & { label?: string } = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (e) {
    const cause = (e as { cause?: { message?: string } }).cause?.message ?? (e as Error).message;
    throw new PlatformError(`Couldn't reach ${init.label ?? url}: ${cause}`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const detail = body.length > 600 ? `${body.slice(0, 600)}...` : body;
    throw new PlatformError(
      `${init.label ?? url} failed (${res.status}): ${detail}`,
      res.status === 401,
    );
  }
  return res;
}

export function form(data: Record<string, string>): URLSearchParams {
  return new URLSearchParams(data);
}

export function expiresIn(seconds: number | undefined): Date | undefined {
  return seconds ? new Date(Date.now() + seconds * 1000) : undefined;
}
