import { linkedin, linkedinPages } from "./linkedin";
import { facebook, instagram } from "./meta";
import { x } from "./x";
import type { Platform, PlatformId } from "./types";

// TikTok and YouTube are added in milestone 3.
export const PLATFORMS: Platform[] = [instagram, facebook, linkedinPages, linkedin, x];

export function getPlatform(id: string): Platform | undefined {
  return PLATFORMS.find((p) => p.id === (id as PlatformId));
}

export * from "./types";
