import { index, integer, snakeCase, text } from "drizzle-orm/sqlite-core"
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core"
import type { StoredBot } from "../../shared/bots"
import type { ConversationMessage } from "../../shared/conversations"

export const projects = snakeCase.table("projects", {
  id: text().primaryKey(),
  name: text().notNull(),
  defaultWorkingDirectory: text().notNull(),
  createdAt: text().notNull(),
})

export const bots = snakeCase.table("bots", {
  id: text().primaryKey(),
  leaderBotId: text().references((): AnySQLiteColumn => bots.id, { onDelete: "cascade" }),
  projectId: text().references(() => projects.id, { onDelete: "set null" }),
  name: text().notNull(),
  provider: text({ enum: ["codex"] }).notNull(),
  function: text({ mode: "json" }).$type<StoredBot["function"]>().notNull(),
  workingDirectoryOverride: text(),
  createdAt: text().notNull(),
}, (table) => [
  index("bots_leader_bot_id").on(table.leaderBotId),
  index("bots_project_id").on(table.projectId),
])

export const conversations = snakeCase.table("conversations", {
  botId: text().primaryKey().references(() => bots.id, { onDelete: "cascade" }),
  sessionFile: text(),
})

export const messages = snakeCase.table("messages", {
  id: text().primaryKey(),
  botId: text().notNull().references(() => bots.id, { onDelete: "cascade" }),
  position: integer().notNull(),
  author: text({ enum: ["person", "bot"] }).$type<ConversationMessage["author"]>().notNull(),
  content: text().notNull(),
  createdAt: text().notNull(),
}, (table) => [index("messages_bot_position").on(table.botId, table.position)])
