CREATE TABLE `bots` (
	`id` text PRIMARY KEY,
	`leader_bot_id` text,
	`name` text NOT NULL,
	`provider` text NOT NULL,
	`function` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT `fk_bots_leader_bot_id_bots_id_fk` FOREIGN KEY (`leader_bot_id`) REFERENCES `bots`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `bots_leader_bot_id` ON `bots` (`leader_bot_id`);