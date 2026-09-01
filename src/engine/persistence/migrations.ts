import type { MigrationsJournal } from "drizzle-orm/migrator"
import initialSchema from "../../../drizzle/20260831155650_initial-schema/migration.sql" with { type: "text" }
import leaderDelegation from "../../../drizzle/20260901003757_leader-delegation/migration.sql" with { type: "text" }
import turnEnding from "../../../drizzle/20260901111156_turn-ending/migration.sql" with { type: "text" }

export const migrations = [
  { name: "20260831155650_initial-schema", timestamp: 1788191810000, sql: initialSchema },
  { name: "20260901003757_leader-delegation", timestamp: 1788223077000, sql: leaderDelegation },
  { name: "20260901111156_turn-ending", timestamp: 1788261116000, sql: turnEnding },
] satisfies MigrationsJournal
