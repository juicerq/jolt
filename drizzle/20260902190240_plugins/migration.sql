CREATE TABLE `accesses` (
	`bot_id` text NOT NULL,
	`plugin_id` text NOT NULL,
	`account_id` text NOT NULL,
	CONSTRAINT `accesses_pk` PRIMARY KEY(`bot_id`, `plugin_id`),
	CONSTRAINT `fk_accesses_bot_id_bots_id_fk` FOREIGN KEY (`bot_id`) REFERENCES `bots`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_accesses_account_id_accounts_id_fk` FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `accounts` (
	`id` text PRIMARY KEY,
	`plugin_id` text NOT NULL,
	`label` text NOT NULL,
	`state` text NOT NULL,
	`secret` text,
	`tools` text DEFAULT '[]' NOT NULL,
	`checked_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `plugins` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`config` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `accesses_account_id` ON `accesses` (`account_id`);--> statement-breakpoint
CREATE INDEX `accounts_plugin_id` ON `accounts` (`plugin_id`);