import { sql } from "drizzle-orm"
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"

export const applicationState = sqliteTable("application_state", {
  id: integer("id").primaryKey(),
  createdAt: text("created_at").notNull(),
})

export const teams = sqliteTable("teams", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  objective: text("objective").notNull(),
  defaultProvider: text("default_provider", { enum: ["codex", "claude"] }).notNull(),
  createdAt: text("created_at").notNull(),
})

export const bots = sqliteTable("bots", {
  id: text("id").primaryKey(),
  teamId: text("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  role: text("role", { enum: ["leader", "member"] }).notNull(),
  provider: text("provider", { enum: ["codex", "claude"] }).notNull(),
  functionOutcome: text("function_outcome").notNull(),
  functionResponsibilities: text("function_responsibilities").notNull(),
  functionLimits: text("function_limits").notNull(),
  functionDelivery: text("function_delivery").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("bots_one_leader_per_team").on(table.teamId).where(sql`${table.role} = 'leader'`),
])
