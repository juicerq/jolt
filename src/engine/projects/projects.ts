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
  function nestMembers(groupBots: ReturnType<typeof bots.list>) {
    return groupBots
      .filter((bot) => bot.leaderBotId === null)
      .map((bot) => ({ ...bot, members: groupBots.filter((member) => member.leaderBotId === bot.id) }))
  }

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
      const projects = parse(projectSchemas.projectList, database.projects.list())
      const allBots = bots.list()
      const output = {
        projects: projects.map((project) => ({
          ...project,
          bots: nestMembers(allBots.filter((bot) => bot.projectId === project.id)),
        })),
        unassignedBots: nestMembers(allBots.filter((bot) => bot.projectId === null)),
      }

      return parse(projectSchemas.groupedList, output)
    },
  }
}
