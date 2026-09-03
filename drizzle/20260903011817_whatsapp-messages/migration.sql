CREATE TABLE `whatsapp_messages` (
	`id` text PRIMARY KEY,
	`account_id` text NOT NULL,
	`chat_id` text NOT NULL,
	`chat_name` text NOT NULL,
	`sender_name` text NOT NULL,
	`from_me` integer NOT NULL,
	`content` text NOT NULL,
	`sent_at` text NOT NULL,
	CONSTRAINT `fk_whatsapp_messages_account_id_accounts_id_fk` FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `whatsapp_messages_account_chat` ON `whatsapp_messages` (`account_id`,`chat_id`,`sent_at`);--> statement-breakpoint
CREATE INDEX `whatsapp_messages_account_sent_at` ON `whatsapp_messages` (`account_id`,`sent_at`);