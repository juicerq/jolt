import type { MigrationsJournal } from "drizzle-orm/migrator"
import createBots from "../../../drizzle/20260831101537_create-bots/migration.sql" with { type: "text" }

export const migrations = [
  { name: "20260831101537_create-bots", timestamp: 1788171337000, sql: createBots },
] satisfies MigrationsJournal
