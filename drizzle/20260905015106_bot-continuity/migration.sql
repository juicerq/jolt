CREATE TABLE `curation_failures` (
	`bot_id` text PRIMARY KEY,
	`error` text NOT NULL,
	CONSTRAINT `fk_curation_failures_bot_id_bots_id_fk` FOREIGN KEY (`bot_id`) REFERENCES `bots`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `memory_settings` (
	`id` integer PRIMARY KEY,
	`model` text
);
--> statement-breakpoint
CREATE VIRTUAL TABLE message_search USING fts5(content, content='messages', content_rowid='rowid', tokenize='unicode61 remove_diacritics 2');
--> statement-breakpoint
CREATE TRIGGER messages_search_insert AFTER INSERT ON messages BEGIN
  INSERT INTO message_search(rowid, content) VALUES (new.rowid, new.content);
END;
--> statement-breakpoint
CREATE TRIGGER messages_search_delete AFTER DELETE ON messages BEGIN
  INSERT INTO message_search(message_search, rowid, content) VALUES ('delete', old.rowid, old.content);
END;
--> statement-breakpoint
CREATE TRIGGER messages_search_update AFTER UPDATE OF content ON messages BEGIN
  INSERT INTO message_search(message_search, rowid, content) VALUES ('delete', old.rowid, old.content);
  INSERT INTO message_search(rowid, content) VALUES (new.rowid, new.content);
END;
--> statement-breakpoint
INSERT INTO message_search(message_search) VALUES ('rebuild');
