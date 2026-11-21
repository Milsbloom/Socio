import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { decrypt, encrypt, hashPassword, verifyPassword } from "./crypto";
import { sign, verifySigned } from "./session";
import { checkForPlatform } from "./validate";
import { toLittleText } from "../platforms/linkedin";

test("tokens round-trip through encryption and tampering is caught", () => {
  const key = randomBytes(32);
  const box = encrypt("secret-token", key);
  assert.equal(decrypt(box, key), "secret-token");
  const [iv, tag, data] = box.split(".");
  const flipped = Buffer.from(data, "base64url");
  flipped[0] ^= 1;
  assert.throws(() => decrypt([iv, tag, flipped.toString("base64url")].join("."), key));
});

test("passwords verify only with the right password", async () => {
  const h = await hashPassword("correct horse battery");
  assert.equal(await verifyPassword("correct horse battery", h), true);
  assert.equal(await verifyPassword("wrong", h), false);
});

test("signed values reject tampering, wrong secrets and expiry", async () => {
  const t = await sign({ uid: 7 }, "s1", 60);
  assert.equal((await verifySigned<{ uid: number }>(t, "s1"))?.uid, 7);
  assert.equal(await verifySigned(t, "s2"), null);
  assert.equal(await verifySigned(t.replace(/^./, "x"), "s1"), null);
  assert.equal(await verifySigned(await sign({ uid: 7 }, "s1", -5), "s1"), null);
});

test("platform rules catch common mistakes", () => {
  const x = { label: "X", captionLimit: 280, maxImages: 4 };
  assert.deepEqual(checkForPlatform(x, "hello", []), []);
  assert.equal(checkForPlatform(x, "a".repeat(281), []).length, 1);
  assert.equal(checkForPlatform(x, "", [{ kind: "image" }, { kind: "image" }, { kind: "image" }, { kind: "image" }, { kind: "image" }]).length, 1);
  assert.equal(checkForPlatform(x, "", [{ kind: "video" }, { kind: "image" }]).length, 1);
  assert.equal(checkForPlatform(x, "", []).length, 1);
  const tiktok = { label: "TikTok", captionLimit: 2200, maxImages: 0, requiresMedia: "video" as const };
  assert.equal(checkForPlatform(tiktok, "hi", []).length, 1);
  assert.deepEqual(checkForPlatform(tiktok, "hi", [{ kind: "video" }]), []);
  assert.equal(checkForPlatform(tiktok, "hi", [{ kind: "image" }]).length, 2);
  const ig = { label: "Instagram", captionLimit: 2200, maxImages: 10, imageTypes: ["image/jpeg"], requiresMedia: "any" as const };
  assert.deepEqual(checkForPlatform(ig, "", [{ kind: "image", mimeType: "image/jpeg" }]), []);
  assert.equal(checkForPlatform(ig, "", [{ kind: "image", mimeType: "image/png" }]).length, 1);
  assert.equal(checkForPlatform(ig, "text only", []).length, 1);
});

test("LinkedIn text escapes markup and keeps hashtags", () => {
  assert.equal(toLittleText("Launch (beta) @ 9am #socio"), "Launch \\(beta\\) \\@ 9am {hashtag|\\#|socio}");
});

test("TikTok upload chunks follow TikTok's size rules", async () => {
  const { chunkPlan } = await import("../platforms/tiktok");
  const MB = 1024 * 1024;
  assert.deepEqual(chunkPlan(3 * MB), { chunkSize: 3 * MB, count: 1 });
  assert.deepEqual(chunkPlan(8 * MB), { chunkSize: 8 * MB, count: 1 });
  assert.deepEqual(chunkPlan(25 * MB), { chunkSize: 10 * MB, count: 2 });
});

test("YouTube titles come from the first line and fit 100 characters", async () => {
  const { titleFrom } = await import("../platforms/youtube");
  assert.equal(titleFrom("\nLaunch day <3\nmore text"), "Launch day 3");
  assert.equal([...titleFrom("a".repeat(150))].length, 100);
  assert.equal(titleFrom(""), "New video");
});
