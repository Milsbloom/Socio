import { linkedin, linkedinPages } from "./linkedin";
import { x } from "./x";
import type { Platform, PlatformId } from "./types";

// Instagram, Facebook, TikTok and YouTube are added in later milestones.
export const PLATFORMS: Platform[] = [linkedinPages, linkedin, x];

export function getPlatform(id: string): Platform | undefined {
  return PLATFORMS.find((p) => p.id === (id as PlatformId));
}

export * from "./types";
