import initial from "../../../drizzle/0000-initial.sql" with { type: "text" }
import createTeams from "../../../drizzle/0001-create-teams.sql" with { type: "text" }

export const migrations = [
  { id: 1, statements: [initial] },
  { id: 2, statements: createTeams.split("--> statement-breakpoint").map((statement) => statement.trim()).filter(Boolean) },
]
