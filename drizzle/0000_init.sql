CREATE TABLE `api_keys` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`key_hash` varchar(128) NOT NULL,
	`last_used_at` datetime,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `api_keys_id` PRIMARY KEY(`id`),
	CONSTRAINT `api_keys_key_hash_unique` UNIQUE(`key_hash`)
);
--> statement-breakpoint
CREATE TABLE `media` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`kind` varchar(16) NOT NULL,
	`mime_type` varchar(100) NOT NULL,
	`file_name` varchar(255) NOT NULL,
	`size_bytes` bigint NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `media_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `post_targets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`post_id` int NOT NULL,
	`account_id` int NOT NULL,
	`caption_override` text,
	`status` varchar(32) NOT NULL DEFAULT 'pending',
	`remote_id` varchar(255),
	`remote_url` varchar(1024),
	`error` text,
	`meta` json,
	`published_at` datetime,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `post_targets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `posts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`caption` text NOT NULL,
	`media_ids` json NOT NULL,
	`status` varchar(32) NOT NULL DEFAULT 'draft',
	`scheduled_at` datetime,
	`created_by` varchar(16) NOT NULL DEFAULT 'user',
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `posts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `publish_attempts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`target_id` int NOT NULL,
	`ok` boolean NOT NULL,
	`message` text,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `publish_attempts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `social_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`platform` varchar(32) NOT NULL,
	`external_id` varchar(191) NOT NULL,
	`display_name` varchar(255) NOT NULL,
	`access_token_enc` text NOT NULL,
	`refresh_token_enc` text,
	`token_expires_at` datetime,
	`status` varchar(32) NOT NULL DEFAULT 'connected',
	`meta` json,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `social_accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `acct_unique` UNIQUE(`user_id`,`platform`,`external_id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(191) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE INDEX `targets_post` ON `post_targets` (`post_id`);--> statement-breakpoint
CREATE INDEX `posts_due` ON `posts` (`status`,`scheduled_at`);