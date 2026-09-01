CREATE TABLE `tasks` (
	`id` text PRIMARY KEY,
	`leader_bot_id` text NOT NULL,
	`assignee_bot_id` text NOT NULL,
	`outcome` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`finished_at` text,
	CONSTRAINT `fk_tasks_leader_bot_id_bots_id_fk` FOREIGN KEY (`leader_bot_id`) REFERENCES `bots`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_tasks_assignee_bot_id_bots_id_fk` FOREIGN KEY (`assignee_bot_id`) REFERENCES `bots`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
ALTER TABLE `messages` ADD `author_bot_id` text REFERENCES bots(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `messages` ADD `task_id` text REFERENCES tasks(id) ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX `messages_task_id` ON `messages` (`task_id`);--> statement-breakpoint
CREATE INDEX `tasks_leader_bot_id` ON `tasks` (`leader_bot_id`);--> statement-breakpoint
UPDATE `messages` SET `author_bot_id` = `bot_id` WHERE `author` = 'bot';