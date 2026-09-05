CREATE TABLE `error_automation_settings` (
	`id` integer PRIMARY KEY,
	`config` text,
	`secret` text,
	`last_received_at` text,
	`failure` text
);
--> statement-breakpoint
CREATE TABLE `error_cases` (
	`id` text PRIMARY KEY,
	`source` text NOT NULL,
	`environment` text NOT NULL,
	`error_id` text NOT NULL,
	`revision` text NOT NULL,
	`context_hash` text NOT NULL,
	`state` text NOT NULL,
	`lease_id` text,
	`lease_until` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `error_deliveries` (
	`id` text NOT NULL,
	`source` text NOT NULL,
	`environment` text NOT NULL,
	`case_id` text NOT NULL,
	`payload` text NOT NULL,
	`acknowledged` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT `error_deliveries_pk` PRIMARY KEY(`source`, `environment`, `id`)
);
--> statement-breakpoint
CREATE TABLE `error_runs` (
	`id` text PRIMARY KEY,
	`case_id` text NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `bots` ADD `execution_profile` text;--> statement-breakpoint
CREATE UNIQUE INDEX `error_cases_source_identity` ON `error_cases` (`source`,`environment`,`error_id`);--> statement-breakpoint
CREATE INDEX `error_cases_queue` ON `error_cases` (`state`,`created_at`);--> statement-breakpoint
CREATE INDEX `error_deliveries_ack` ON `error_deliveries` (`acknowledged`);--> statement-breakpoint
CREATE INDEX `error_runs_case` ON `error_runs` (`case_id`);--> statement-breakpoint
CREATE INDEX `error_runs_day` ON `error_runs` (`created_at`);