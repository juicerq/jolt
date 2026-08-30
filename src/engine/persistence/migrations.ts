import initial from "../../../drizzle/0000-initial.sql" with { type: "text" }

export const migrations = [{ id: 1, sql: initial }]
