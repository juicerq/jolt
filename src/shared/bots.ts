import { type } from "arktype"
import { providerName } from "./providers"

const botFunction = type({ "+": "reject", outcome: "string > 0", responsibilities: "string > 0", limits: "string > 0", delivery: "string > 0" })
export const workingDirectory = type("string > 0")
const optionalId = type("string > 0").or("null")
const storedBot = type({
  "+": "reject",
  id: "string > 0",
  leaderBotId: optionalId,
  projectId: optionalId,
  name: "string > 0",
  provider: providerName,
  function: botFunction,
  workingDirectoryOverride: workingDirectory.or("null"),
  createdAt: "string > 0",
})
const bot = storedBot.merge({ effectiveWorkingDirectory: workingDirectory })
const createFields = { "+": "reject", name: "string > 0", provider: providerName, function: botFunction, "workingDirectoryOverride?": workingDirectory } as const
const createInput = type({ ...createFields, "projectId?": "string > 0" }).or(type({ ...createFields, leaderBotId: "string > 0" }))

export const botSchemas = {
  createInput,
  idInput: type({ "+": "reject", id: "string > 0" }),
  updateWorkspaceInput: type({ "+": "reject", id: "string > 0", projectId: optionalId, workingDirectoryOverride: workingDirectory.or("null") }),
  storedBot,
  storedBotList: storedBot.array(),
  bot,
  botList: bot.array(),
}

export type Bot = typeof bot.infer
export type CreateBotInput = typeof createInput.infer
export type StoredBot = typeof storedBot.infer
