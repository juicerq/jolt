import { type } from "arktype"
import { botSchemas, workingDirectory } from "./bots"

const project = type({
  "+": "reject",
  id: "string > 0",
  name: "string > 0",
  defaultWorkingDirectory: workingDirectory,
  createdAt: "string > 0",
})
const botWithMembers = botSchemas.bot.merge({ members: botSchemas.bot.array() })
const projectWithBots = project.merge({ bots: botWithMembers.array() })

export const projectSchemas = {
  createInput: type({ "+": "reject", name: "string > 0", defaultWorkingDirectory: workingDirectory }),
  project,
  projectList: project.array(),
  groupedList: type({ "+": "reject", projects: projectWithBots.array(), unassignedBots: botWithMembers.array() }),
}

export type Project = typeof project.infer
