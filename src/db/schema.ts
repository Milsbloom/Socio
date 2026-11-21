import {
  boolean,
  datetime,
  int,
  json,
  mysqlTable,
  text,
  uniqueIndex,
  index,
  varchar,
  bigint,
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

const createdAt = () => datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`);
const updatedAt = () =>
  datetime("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`).$onUpdate(() => new Date());

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 191 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  createdAt: createdAt(),
});

export const socialAccounts = mysqlTable(
  "social_accounts",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id").notNull(),
    platform: varchar("platform", { length: 32 }).notNull(),
    externalId: varchar("external_id", { length: 191 }).notNull(),
    displayName: varchar("display_name", { length: 255 }).notNull(),
    accessTokenEnc: text("access_token_enc").notNull(),
    refreshTokenEnc: text("refresh_token_enc"),
    tokenExpiresAt: datetime("token_expires_at"),
    // connected | needs_reconnect
    status: varchar("status", { length: 32 }).notNull().default("connected"),
    meta: json("meta").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("acct_unique").on(t.userId, t.platform, t.externalId)],
);

export const media = mysqlTable("media", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  kind: varchar("kind", { length: 16 }).$type<"image" | "video">().notNull(),
  mimeType: varchar("mime_type", { length: 100 }).notNull(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
  createdAt: createdAt(),
});

export const posts = mysqlTable(
  "posts",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id").notNull(),
    caption: text("caption").notNull(),
    mediaIds: json("media_ids").$type<number[]>().notNull(),
    // draft | scheduled | publishing | done | failed | cancelled
    status: varchar("status", { length: 32 }).notNull().default("draft"),
    scheduledAt: datetime("scheduled_at"),
    createdBy: varchar("created_by", { length: 16 }).notNull().default("user"), // user | ai
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("posts_due").on(t.status, t.scheduledAt)],
);

export const postTargets = mysqlTable(
  "post_targets",
  {
    id: int("id").autoincrement().primaryKey(),
    postId: int("post_id").notNull(),
    accountId: int("account_id").notNull(),
    captionOverride: text("caption_override"),
    // pending | processing | published | failed
    status: varchar("status", { length: 32 }).notNull().default("pending"),
    remoteId: varchar("remote_id", { length: 255 }),
    remoteUrl: varchar("remote_url", { length: 1024 }),
    error: text("error"),
    meta: json("meta").$type<Record<string, unknown>>(),
    publishedAt: datetime("published_at"),
    updatedAt: updatedAt(),
  },
  (t) => [index("targets_post").on(t.postId)],
);

export const publishAttempts = mysqlTable("publish_attempts", {
  id: int("id").autoincrement().primaryKey(),
  targetId: int("target_id").notNull(),
  ok: boolean("ok").notNull(),
  message: text("message"),
  createdAt: createdAt(),
});

export const apiKeys = mysqlTable("api_keys", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  keyHash: varchar("key_hash", { length: 128 }).notNull().unique(),
  lastUsedAt: datetime("last_used_at"),
  createdAt: createdAt(),
});

export type SocialAccount = typeof socialAccounts.$inferSelect;
export type Post = typeof posts.$inferSelect;
export type PostTarget = typeof postTargets.$inferSelect;
export type Media = typeof media.$inferSelect;
