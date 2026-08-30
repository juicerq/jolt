import { Database } from "bun:sqlite"
import { drizzle } from "drizzle-orm/bun-sqlite"
import { asc, eq, sql } from "drizzle-orm"
import { migrations } from "./migrations"
import { bots, teams as teamRecords } from "./schema"
import type { Observability } from "../observability/observability"
import type { Team } from "../../shared/teams"

function mapTeam(row: {
  team: typeof teamRecords.$inferSelect
  leader: typeof bots.$inferSelect
}): Team {
  return {
    id: row.team.id,
    name: row.team.name,
    objective: row.team.objective,
    defaultProvider: row.team.defaultProvider,
    createdAt: row.team.createdAt,
    leader: {
      id: row.leader.id,
      name: row.leader.name,
      role: "leader",
      provider: row.leader.provider,
      function: {
        outcome: row.leader.functionOutcome,
        responsibilities: row.leader.functionResponsibilities,
        limits: row.leader.functionLimits,
        delivery: row.leader.functionDelivery,
      },
      createdAt: row.leader.createdAt,
    },
  }
}

export function openDatabase(path: string, observability: Observability) {
  const sqlite = new Database(path, { create: true })
  const database = drizzle(sqlite)

  sqlite.run("PRAGMA foreign_keys = ON")

  observability.span({ name: "database.migrate" }, () => {
    database.run(sql.raw("CREATE TABLE IF NOT EXISTS __drizzle_migrations (id INTEGER PRIMARY KEY NOT NULL)"))

    for (const migration of migrations) {
      const applied = sqlite.query<{ id: number }, [number]>("SELECT id FROM __drizzle_migrations WHERE id = ?").get(migration.id)

      if (applied) {
        continue
      }

      sqlite.transaction(() => {
        for (const statement of migration.statements) {
          database.run(sql.raw(statement))
        }

        database.run(sql`INSERT INTO __drizzle_migrations (id) VALUES (${migration.id})`)
      })()
    }
  })

  return {
    teams: {
      create(team: Team) {
        return observability.span({
          name: "database.teamcreate",
          context: { teamId: team.id, botId: team.leader.id },
        }, () => sqlite.transaction(() => {
          database.insert(teamRecords).values({
            id: team.id,
            name: team.name,
            objective: team.objective,
            defaultProvider: team.defaultProvider,
            createdAt: team.createdAt,
          }).run()
          database.insert(bots).values({
            id: team.leader.id,
            teamId: team.id,
            name: team.leader.name,
            role: "leader",
            provider: team.leader.provider,
            functionOutcome: team.leader.function.outcome,
            functionResponsibilities: team.leader.function.responsibilities,
            functionLimits: team.leader.function.limits,
            functionDelivery: team.leader.function.delivery,
            createdAt: team.leader.createdAt,
          }).run()

          return team
        })())
      },
      list() {
        return observability.span({ name: "database.teamlist" }, () =>
          database
            .select({ team: teamRecords, leader: bots })
            .from(teamRecords)
            .innerJoin(bots, eq(bots.teamId, teamRecords.id))
            .where(eq(bots.role, "leader"))
            .orderBy(asc(teamRecords.createdAt), asc(teamRecords.id))
            .all()
            .map(mapTeam),
        )
      },
      get(id: string) {
        return observability.span({ name: "database.teamget", context: { teamId: id } }, () => {
          const row = database
            .select({ team: teamRecords, leader: bots })
            .from(teamRecords)
            .innerJoin(bots, eq(bots.teamId, teamRecords.id))
            .where(sql`${teamRecords.id} = ${id} AND ${bots.role} = 'leader'`)
            .get()

          return row ? mapTeam(row) : undefined
        })
      },
    },
    migrationState() {
      return observability.span({ name: "database.transaction" }, () =>
        database
          .all<{ id: number }>(sql`SELECT id FROM __drizzle_migrations ORDER BY id`)
          .map((entry) => entry.id),
      )
    },
    close() {
      sqlite.close()
    },
  }
}

export type AppDatabase = ReturnType<typeof openDatabase>
