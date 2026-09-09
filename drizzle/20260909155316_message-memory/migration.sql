CREATE TABLE `memory_progress` (
	`bot_id` text PRIMARY KEY,
	`curated_through_position` integer DEFAULT 0 NOT NULL,
	CONSTRAINT `fk_memory_progress_bot_id_bots_id_fk` FOREIGN KEY (`bot_id`) REFERENCES `bots`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
ALTER TABLE `memories` ADD `source_message_id` text REFERENCES messages(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `memories` ADD `superseded_at` text;--> statement-breakpoint
ALTER TABLE `memories` ADD `superseded_by_message_id` text REFERENCES messages(id) ON DELETE SET NULL;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_memories` (
	`id` text PRIMARY KEY,
	`bot_id` text NOT NULL,
	`content` text NOT NULL,
	`origin` text NOT NULL,
	`source_message_id` text,
	`superseded_at` text,
	`superseded_by_message_id` text,
	`curation_version` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT `fk_memories_bot_id_bots_id_fk` FOREIGN KEY (`bot_id`) REFERENCES `bots`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_memories_source_message_id_messages_id_fk` FOREIGN KEY (`source_message_id`) REFERENCES `messages`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_memories_superseded_by_message_id_messages_id_fk` FOREIGN KEY (`superseded_by_message_id`) REFERENCES `messages`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
INSERT INTO `__new_memories`(`id`, `bot_id`, `content`, `origin`, `source_message_id`, `curation_version`, `created_at`) SELECT m.id, m.bot_id, m.content, m.origin, (SELECT n.message_id FROM notes n JOIN messages s ON s.id = n.message_id WHERE n.id = m.note_id AND s.bot_id = m.bot_id), m.curation_version, m.created_at FROM memories m;--> statement-breakpoint
DROP TABLE `memories`;--> statement-breakpoint
ALTER TABLE `__new_memories` RENAME TO `memories`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
DROP INDEX IF EXISTS `notes_bot_curated`;--> statement-breakpoint
CREATE INDEX `memories_bot_id` ON `memories` (`bot_id`);--> statement-breakpoint
INSERT INTO memory_progress (bot_id, curated_through_position)
SELECT b.id, CASE WHEN b.memory_enabled = 0 THEN coalesce((SELECT max(position) FROM messages WHERE bot_id = b.id), 0)
ELSE coalesce((SELECT min(m.position) - 1 FROM notes n JOIN messages m ON m.id = n.message_id WHERE n.bot_id = b.id AND m.bot_id = b.id AND n.curated_at IS NULL), (SELECT max(position) FROM messages WHERE bot_id = b.id), 0) END
FROM bots b WHERE b.temporary = 0;--> statement-breakpoint
DROP TABLE `notes`;--> statement-breakpoint
CREATE VIRTUAL TABLE memory_search USING fts5(content, content='memories', content_rowid='rowid', tokenize='unicode61 remove_diacritics 2');--> statement-breakpoint
CREATE TRIGGER memory_search_insert AFTER INSERT ON memories BEGIN
  INSERT INTO memory_search(rowid, content) VALUES (new.rowid, new.content);
END;--> statement-breakpoint
CREATE TRIGGER memory_search_delete AFTER DELETE ON memories BEGIN
  INSERT INTO memory_search(memory_search, rowid, content) VALUES ('delete', old.rowid, old.content);
END;--> statement-breakpoint
CREATE TRIGGER memory_search_update AFTER UPDATE ON memories BEGIN
  INSERT INTO memory_search(memory_search, rowid, content) VALUES ('delete', old.rowid, old.content);
  INSERT INTO memory_search(rowid, content) VALUES (new.rowid, new.content);
END;--> statement-breakpoint
INSERT INTO memory_search(memory_search) VALUES ('rebuild');
