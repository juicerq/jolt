import { z } from "zod"
import { botSchemas, workingDirectory } from "./bots"

const id = z.string().min(1)
const project = z.strictObject({
  id,
  name: id,
  defaultWorkingDirectory: workingDirectory.nullable(),
  createdAt: id,
})
const botWithMembers = botSchemas.bot.extend({ members: z.array(botSchemas.bot) })
const projectWithBots = project.extend({ bots: z.array(botWithMembers) })
const groupedList = z.strictObject({ projects: z.array(projectWithBots), unassignedBots: z.array(botWithMembers) })

export const projectSchemas = {
  createInput: z.strictObject({ name: id, defaultWorkingDirectory: workingDirectory.optional() }),
  project,
  projectList: z.array(project),
  groupedList,
}

export type Project = z.infer<typeof project>
export type ProjectGroups = z.infer<typeof groupedList>
