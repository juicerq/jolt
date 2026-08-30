CREATE TABLE `teams` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`objective` text NOT NULL,
	`default_provider` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `bots` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`provider` text NOT NULL,
	`function_outcome` text NOT NULL,
	`function_responsibilities` text NOT NULL,
	`function_limits` text NOT NULL,
	`function_delivery` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bots_one_leader_per_team` ON `bots` (`team_id`) WHERE `role` = 'leader';
