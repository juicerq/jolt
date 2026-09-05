import { projectSchemas, type Project } from "@src/shared/projects"
import type { Observability } from "../observability/observability"
import type { AppDatabase } from "../persistence/database"
import type { createBots } from "../bots/bots"
import { assertAccessibleWorkingDirectory } from "./working-directory"
import { parse } from "@src/shared/parse"

interface ProjectsDependencies {
  database: AppDatabase
  observability: Observability
  bots: ReturnType<typeof createBots>
}

export function createProjects({ database, observability, bots }: ProjectsDependencies) {
  return {
    async create(rawInput: unknown) {
      const input = parse(projectSchemas.createInput, rawInput)
      if (input.defaultWorkingDirectory) {
        await assertAccessibleWorkingDirectory(input.defaultWorkingDirectory)
      }

      const project: Project = { id: crypto.randomUUID(), ...input, defaultWorkingDirectory: input.defaultWorkingDirectory ?? null, createdAt: new Date().toISOString() }

      return observability.span(
        { name: "projects.create", context: { projectId: project.id } },
        () => database.projects.create(project),
      )
    },
    list() {
      const allBots = bots.list()
      const membersByLeader = Map.groupBy(allBots.filter((bot) => bot.leaderBotId !== null), (bot) => bot.leaderBotId)
      const roots = allBots.filter((bot) => bot.leaderBotId === null).map((bot) => ({ ...bot, members: membersByLeader.get(bot.id) ?? [] }))
      const botsByProject = Map.groupBy(roots, (bot) => bot.projectId)

      return {
        projects: database.projects.list().map((project) => ({ ...project, bots: botsByProject.get(project.id) ?? [] })),
        unassignedBots: botsByProject.get(null) ?? [],
      }
    },
  }
}
