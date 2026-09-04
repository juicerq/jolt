CREATE TABLE `trigger_runs` (
	`id` text PRIMARY KEY,
	`trigger_id` text NOT NULL,
	`bot_id` text NOT NULL,
	`delivery_id` text NOT NULL,
	`event` text NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`created_at` text NOT NULL,
	`started_at` text,
	`finished_at` text,
	CONSTRAINT `fk_trigger_runs_trigger_id_triggers_id_fk` FOREIGN KEY (`trigger_id`) REFERENCES `triggers`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_trigger_runs_bot_id_bots_id_fk` FOREIGN KEY (`bot_id`) REFERENCES `bots`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `triggers` (
	`id` text PRIMARY KEY,
	`bot_id` text NOT NULL,
	`account_id` text NOT NULL,
	`source` text NOT NULL,
	`name` text NOT NULL,
	`event` text NOT NULL,
	`actions` text NOT NULL,
	`repositories` text NOT NULL,
	`labels` text NOT NULL,
	`instruction` text NOT NULL,
	`include_own_events` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT `fk_triggers_bot_id_bots_id_fk` FOREIGN KEY (`bot_id`) REFERENCES `bots`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_triggers_account_id_accounts_id_fk` FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
ALTER TABLE `messages` ADD `trigger_run_id` text;--> statement-breakpoint
CREATE INDEX `messages_trigger_run_id` ON `messages` (`trigger_run_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `trigger_runs_trigger_delivery` ON `trigger_runs` (`trigger_id`,`delivery_id`);--> statement-breakpoint
CREATE INDEX `trigger_runs_bot_status` ON `trigger_runs` (`bot_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `triggers_bot_id` ON `triggers` (`bot_id`);--> statement-breakpoint
CREATE INDEX `triggers_account_id` ON `triggers` (`account_id`);