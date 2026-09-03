PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_accesses` (
	`bot_id` text NOT NULL,
	`account_id` text NOT NULL,
	CONSTRAINT `accesses_pk` PRIMARY KEY(`bot_id`, `account_id`),
	CONSTRAINT `fk_accesses_bot_id_bots_id_fk` FOREIGN KEY (`bot_id`) REFERENCES `bots`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_accesses_account_id_accounts_id_fk` FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
INSERT INTO `__new_accesses`(`bot_id`, `account_id`) SELECT `bot_id`, `account_id` FROM `accesses`;--> statement-breakpoint
DROP TABLE `accesses`;--> statement-breakpoint
ALTER TABLE `__new_accesses` RENAME TO `accesses`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `accesses_account_id` ON `accesses` (`account_id`);