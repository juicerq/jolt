ALTER TABLE `bots` ADD `avatar_seed` text NOT NULL DEFAULT '';
--> statement-breakpoint
UPDATE `bots` SET `avatar_seed` = 'jolt:' || `id` || ':' || `name`;
