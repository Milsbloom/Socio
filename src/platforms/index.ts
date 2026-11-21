import { linkedin, linkedinPages } from "./linkedin";
import { facebook, instagram } from "./meta";
import { tiktokPlatform } from "./tiktok";
import { x } from "./x";
import { youtube } from "./youtube";
import type { Platform, PlatformId } from "./types";

export const PLATFORMS: Platform[] = [instagram, facebook, tiktokPlatform, youtube, linkedinPages, linkedin, x];

export function getPlatform(id: string): Platform | undefined {
  return PLATFORMS.find((p) => p.id === (id as PlatformId));
}

export * from "./types";
