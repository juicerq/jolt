import type { MigrationsJournal } from "drizzle-orm/migrator"
import initialSchema from "../../../drizzle/20260831155650_initial-schema/migration.sql" with { type: "text" }

export const migrations = [
  { name: "20260831155650_initial-schema", timestamp: 1788191810000, sql: initialSchema },
] satisfies MigrationsJournal
