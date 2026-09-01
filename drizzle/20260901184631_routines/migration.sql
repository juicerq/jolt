CREATE TABLE `routines` (
	`id` text PRIMARY KEY,
	`bot_id` text NOT NULL,
	`content` text NOT NULL,
	`frequency` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`next_call_at` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT `fk_routines_bot_id_bots_id_fk` FOREIGN KEY (`bot_id`) REFERENCES `bots`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `routines_bot_id` ON `routines` (`bot_id`);