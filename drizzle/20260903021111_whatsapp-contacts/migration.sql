CREATE TABLE `whatsapp_contacts` (
	`account_id` text NOT NULL,
	`jid` text NOT NULL,
	`name` text NOT NULL,
	CONSTRAINT `whatsapp_contacts_pk` PRIMARY KEY(`account_id`, `jid`),
	CONSTRAINT `fk_whatsapp_contacts_account_id_accounts_id_fk` FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
INSERT INTO `whatsapp_contacts` (`account_id`, `jid`, `name`) SELECT `account_id`, `chat_id`, `chat_name` FROM (SELECT `account_id`, `chat_id`, `chat_name`, max(`sent_at`) FROM `whatsapp_messages` WHERE `chat_name` <> `chat_id` GROUP BY `account_id`, `chat_id`);
--> statement-breakpoint
DELETE FROM `whatsapp_messages` WHERE `content` IN ('[protocol]', '[placeholder]', '[reaction]', '[messageContextInfo]', '[deviceSent]', '[keepInChat]');
--> statement-breakpoint
ALTER TABLE `whatsapp_messages` DROP COLUMN `chat_name`;