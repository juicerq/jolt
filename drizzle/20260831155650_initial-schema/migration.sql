CREATE TABLE `bots` (
	`id` text PRIMARY KEY,
	`leader_bot_id` text,
	`project_id` text,
	`name` text NOT NULL,
	`provider` text NOT NULL,
	`function` text NOT NULL,
	`working_directory_override` text,
	`created_at` text NOT NULL,
	CONSTRAINT `fk_bots_leader_bot_id_bots_id_fk` FOREIGN KEY (`leader_bot_id`) REFERENCES `bots`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_bots_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`bot_id` text PRIMARY KEY,
	`session_file` text,
	CONSTRAINT `fk_conversations_bot_id_bots_id_fk` FOREIGN KEY (`bot_id`) REFERENCES `bots`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY,
	`bot_id` text NOT NULL,
	`position` integer NOT NULL,
	`author` text NOT NULL,
	`content` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT `fk_messages_bot_id_bots_id_fk` FOREIGN KEY (`bot_id`) REFERENCES `bots`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`default_working_directory` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `bots_leader_bot_id` ON `bots` (`leader_bot_id`);--> statement-breakpoint
CREATE INDEX `bots_project_id` ON `bots` (`project_id`);--> statement-breakpoint
CREATE INDEX `messages_bot_position` ON `messages` (`bot_id`,`position`);