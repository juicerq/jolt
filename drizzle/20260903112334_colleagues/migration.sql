CREATE TABLE `colleagues` (
	`bot_id` text NOT NULL,
	`colleague_bot_id` text NOT NULL,
	CONSTRAINT `colleagues_pk` PRIMARY KEY(`bot_id`, `colleague_bot_id`),
	CONSTRAINT `fk_colleagues_bot_id_bots_id_fk` FOREIGN KEY (`bot_id`) REFERENCES `bots`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_colleagues_colleague_bot_id_bots_id_fk` FOREIGN KEY (`colleague_bot_id`) REFERENCES `bots`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
ALTER TABLE `tasks` RENAME COLUMN `leader_bot_id` TO `caller_bot_id`;--> statement-breakpoint
DROP INDEX IF EXISTS `tasks_leader_bot_id`;--> statement-breakpoint
CREATE INDEX `colleagues_colleague_bot_id` ON `colleagues` (`colleague_bot_id`);--> statement-breakpoint
CREATE INDEX `tasks_caller_bot_id` ON `tasks` (`caller_bot_id`);--> statement-breakpoint
CREATE INDEX `tasks_assignee_bot_id` ON `tasks` (`assignee_bot_id`);