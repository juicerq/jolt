import { Database } from "bun:sqlite"
import { drizzle } from "drizzle-orm/bun-sqlite"
import { asc, eq, sql } from "drizzle-orm"
import { migrations } from "./migrations"
import { bots, teams as teamRecords } from "./schema"
import type { Observability } from "../observability/observability"
import type { Member, Team } from "../../shared/teams"

function mapMember(row: typeof bots.$inferSelect): Member {
  return {
    id: row.id,
    teamId: row.teamId,
    name: row.name,
    role: "member",
    provider: row.provider,
    function: {
      outcome: row.functionOutcome,
      responsibilities: row.functionResponsibilities,
      limits: row.functionLimits,
      delivery: row.functionDelivery,
    },
    createdAt: row.createdAt,
  }
}

function mapTeam(row: {
  team: typeof teamRecords.$inferSelect
  leader: typeof bots.$inferSelect
}, members: Member[]): Team {
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
    members,
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
      createMember(member: Member) {
        return observability.span({
          name: "database.membercreate",
          context: { teamId: member.teamId, botId: member.id, provider: member.provider },
        }, () => {
          database.insert(bots).values({
            id: member.id,
            teamId: member.teamId,
            name: member.name,
            role: "member",
            provider: member.provider,
            functionOutcome: member.function.outcome,
            functionResponsibilities: member.function.responsibilities,
            functionLimits: member.function.limits,
            functionDelivery: member.function.delivery,
            createdAt: member.createdAt,
          }).run()

          return member
        })
      },
      list() {
        return observability.span({ name: "database.teamlist" }, () => {
          const rows = database
            .select({ team: teamRecords, leader: bots })
            .from(teamRecords)
            .innerJoin(bots, eq(bots.teamId, teamRecords.id))
            .where(eq(bots.role, "leader"))
            .orderBy(asc(teamRecords.createdAt), asc(teamRecords.id))
            .all()
          const members = database
            .select()
            .from(bots)
            .where(eq(bots.role, "member"))
            .orderBy(asc(bots.createdAt), asc(bots.id))
            .all()
            .map(mapMember)
          const membersByTeam = new Map<string, Member[]>()

          for (const member of members) {
            const teamMembers = membersByTeam.get(member.teamId) ?? []

            teamMembers.push(member)
            membersByTeam.set(member.teamId, teamMembers)
          }

          return rows.map((row) => mapTeam(row, membersByTeam.get(row.team.id) ?? []))
        })
      },
      get(id: string) {
        return observability.span({ name: "database.teamget", context: { teamId: id } }, () => {
          const row = database
            .select({ team: teamRecords, leader: bots })
            .from(teamRecords)
            .innerJoin(bots, eq(bots.teamId, teamRecords.id))
            .where(sql`${teamRecords.id} = ${id} AND ${bots.role} = 'leader'`)
            .get()

          if (!row) {
            return undefined
          }

          const members = database.select().from(bots)
            .where(sql`${bots.teamId} = ${id} AND ${bots.role} = 'member'`)
            .orderBy(asc(bots.createdAt), asc(bots.id))
            .all()
            .map(mapMember)

          return mapTeam(row, members)
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
