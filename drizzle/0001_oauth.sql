CREATE TABLE `oauth_clients` (
	`id` varchar(64) NOT NULL,
	`name` varchar(255) NOT NULL,
	`redirect_uris` json NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `oauth_clients_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `oauth_codes` (
	`code_hash` varchar(128) NOT NULL,
	`client_id` varchar(64) NOT NULL,
	`user_id` int NOT NULL,
	`redirect_uri` varchar(1024) NOT NULL,
	`code_challenge` varchar(128) NOT NULL,
	`expires_at` datetime NOT NULL,
	CONSTRAINT `oauth_codes_code_hash` PRIMARY KEY(`code_hash`)
);
