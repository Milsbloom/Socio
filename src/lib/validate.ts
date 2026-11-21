import type { Platform } from "@/platforms/types";

export interface DraftMedia {
  kind: "image" | "video";
  mimeType?: string;
}

export type PlatformRules = Pick<Platform, "label" | "captionLimit" | "maxImages"> & {
  requiresMedia?: Platform["requiresMedia"] | null;
  imageTypes?: string[] | null;
};

/** Problems that would make a platform reject the post, in plain words. Empty when it's fine. */
export function checkForPlatform(platform: PlatformRules, caption: string, media: DraftMedia[]): string[] {
  const problems: string[] = [];
  const images = media.filter((m) => m.kind === "image");
  const videos = media.filter((m) => m.kind === "video").length;

  // X counts characters differently from JavaScript for emoji; this is a close, conservative check.
  const length = [...caption].length;
  if (length > platform.captionLimit) {
    problems.push(`${platform.label} allows ${platform.captionLimit} characters; this caption has ${length}.`);
  }
  if (!caption.trim() && media.length === 0) problems.push("Add a caption or media.");
  if (videos > 1) problems.push(`${platform.label} takes one video per post.`);
  if (videos && images.length) problems.push(`${platform.label} can't mix a video with images in one post.`);
  if (platform.maxImages === 0 && images.length) problems.push(`${platform.label} doesn't take images here, only a video.`);
  else if (images.length > platform.maxImages) problems.push(`${platform.label} allows up to ${platform.maxImages} images.`);
  if (platform.imageTypes && images.some((m) => m.mimeType && !platform.imageTypes!.includes(m.mimeType))) {
    problems.push(`${platform.label} only accepts JPEG images.`);
  }
  if (platform.requiresMedia === "video" && videos !== 1) problems.push(`${platform.label} needs a video.`);
  if (platform.requiresMedia === "any" && media.length === 0) problems.push(`${platform.label} needs an image or video.`);
  return problems;
}
