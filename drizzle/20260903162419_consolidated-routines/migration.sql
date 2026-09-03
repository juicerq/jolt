PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_routines` (
	`id` text PRIMARY KEY,
	`bot_id` text NOT NULL,
	`name` text NOT NULL,
	`content` text NOT NULL,
	`frequency` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`time_zone` text NOT NULL,
	`next_call_at` text,
	`created_at` text NOT NULL,
	CONSTRAINT `fk_routines_bot_id_bots_id_fk` FOREIGN KEY (`bot_id`) REFERENCES `bots`(`id`) ON DELETE CASCADE
);--> statement-breakpoint
INSERT INTO `__new_routines` (`id`, `bot_id`, `name`, `content`, `frequency`, `status`, `time_zone`, `next_call_at`, `created_at`)
SELECT MIN(`id`), `bot_id`, CASE WHEN length(trim(`content`)) > 60 THEN substr(trim(`content`), 1, 57) || '...' ELSE trim(`content`) END, trim(`content`),
	json_object('form', 'fixed-time', 'days', json(json_extract(`frequency`, '$.days')), 'times', json_group_array(json_extract(`frequency`, '$.time'))),
	CASE WHEN `enabled` THEN 'active' ELSE 'paused' END, 'local', MIN(`next_call_at`), MIN(`created_at`)
FROM `routines`
WHERE json_extract(`frequency`, '$.form') = 'fixed-time'
GROUP BY `bot_id`, trim(`content`), json_extract(`frequency`, '$.days'), `enabled`;--> statement-breakpoint
INSERT INTO `__new_routines` (`id`, `bot_id`, `name`, `content`, `frequency`, `status`, `time_zone`, `next_call_at`, `created_at`)
SELECT `id`, `bot_id`, CASE WHEN length(trim(`content`)) > 60 THEN substr(trim(`content`), 1, 57) || '...' ELSE trim(`content`) END, trim(`content`),
	CASE WHEN json_extract(`frequency`, '$.form') = 'interval' THEN json_object('form', 'interval', 'everyMinutes', json_extract(`frequency`, '$.everyMinutes'), 'days', json_array('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'), 'startTime', '00:00', 'endTime', '23:59') ELSE `frequency` END,
	CASE WHEN `enabled` THEN 'active' ELSE 'paused' END, 'local', `next_call_at`, `created_at`
FROM `routines`
WHERE json_extract(`frequency`, '$.form') != 'fixed-time';--> statement-breakpoint
DROP TABLE `routines`;--> statement-breakpoint
ALTER TABLE `__new_routines` RENAME TO `routines`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `routines_bot_id` ON `routines` (`bot_id`);
