PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_projects` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`default_working_directory` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_projects`(`id`, `name`, `default_working_directory`, `created_at`) SELECT `id`, `name`, `default_working_directory`, `created_at` FROM `projects`;--> statement-breakpoint
DROP TABLE `projects`;--> statement-breakpoint
ALTER TABLE `__new_projects` RENAME TO `projects`;--> statement-breakpoint
PRAGMA foreign_keys=ON;