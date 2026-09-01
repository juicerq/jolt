CREATE TABLE `memories` (
	`id` text PRIMARY KEY,
	`bot_id` text NOT NULL,
	`content` text NOT NULL,
	`origin` text NOT NULL,
	`note_id` text,
	`created_at` text NOT NULL,
	CONSTRAINT `fk_memories_bot_id_bots_id_fk` FOREIGN KEY (`bot_id`) REFERENCES `bots`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_memories_note_id_notes_id_fk` FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `notes` (
	`id` text PRIMARY KEY,
	`bot_id` text NOT NULL,
	`content` text NOT NULL,
	`turn_author` text NOT NULL,
	`task_id` text,
	`message_id` text,
	`created_at` text NOT NULL,
	`curated_at` text,
	CONSTRAINT `fk_notes_bot_id_bots_id_fk` FOREIGN KEY (`bot_id`) REFERENCES `bots`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_notes_task_id_tasks_id_fk` FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_notes_message_id_messages_id_fk` FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
ALTER TABLE `bots` ADD `memory_enabled` integer DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX `memories_bot_id` ON `memories` (`bot_id`);--> statement-breakpoint
CREATE INDEX `notes_bot_curated` ON `notes` (`bot_id`,`curated_at`);