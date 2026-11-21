import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomToken } from "./crypto";
import { appUrl } from "./env";

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

export function mediaDir(): string {
  return path.resolve(process.env.MEDIA_DIR || (process.env.DATA_DIR ? path.join(process.env.DATA_DIR, "media") : "./uploads"));
}

export function kindOf(mime: string): "image" | "video" | null {
  if (IMAGE_TYPES.includes(mime)) return "image";
  if (VIDEO_TYPES.includes(mime)) return "video";
  return null;
}

/** Stores bytes under a random, unguessable name and returns that name. */
export async function storeFile(bytes: Buffer, mime: string): Promise<string> {
  const ext = EXT[mime];
  if (!ext) throw new Error(`Unsupported file type ${mime}`);
  await mkdir(mediaDir(), { recursive: true });
  const name = `${randomToken(18)}.${ext}`;
  await writeFile(path.join(mediaDir(), name), bytes);
  return name;
}

/** Resolves a stored file name to its path, refusing anything that would escape the media folder. */
export function filePath(name: string): string {
  if (!/^[A-Za-z0-9_-]+\.[a-z0-9]+$/.test(name)) throw new Error("Bad media file name");
  return path.join(mediaDir(), name);
}

export function readStored(name: string): Promise<Buffer> {
  return readFile(filePath(name));
}

/** Public link, needed by platforms (Instagram) that fetch media themselves. */
export function publicUrl(name: string): string {
  return `${appUrl()}/media/${name}`;
}

export function contentTypeFor(name: string): string {
  const ext = name.split(".").pop();
  return Object.entries(EXT).find(([, e]) => e === ext)?.[0] ?? "application/octet-stream";
}
