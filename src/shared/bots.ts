import { type } from "arktype"
import { providerName } from "./providers"

const botFunction = type({ "+": "reject", outcome: "string > 0", "description?": "string > 0" })
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
  temporary: "boolean",
  memoryEnabled: "boolean",
  createdAt: "string > 0",
})
const bot = storedBot.merge({ effectiveWorkingDirectory: workingDirectory, closed: "boolean" })
const createFields = { "+": "reject", name: "string > 0", provider: providerName, function: botFunction, "workingDirectoryOverride?": workingDirectory } as const
const createInput = type({ ...createFields, "projectId?": "string > 0" }).or(type({ ...createFields, leaderBotId: "string > 0" }))

export const botSchemas = {
  createInput,
  hireInput: type({ "+": "reject", name: "string > 0", function: botFunction, permanent: "boolean" }),
  idInput: type({ "+": "reject", id: "string > 0" }),
  updateInput: type({ "+": "reject", id: "string > 0", name: "string > 0", function: botFunction, projectId: optionalId, workingDirectoryOverride: workingDirectory.or("null"), memoryEnabled: "boolean" }),
  storedBot,
  storedBotList: storedBot.array(),
  bot,
  botList: bot.array(),
}

export type Bot = typeof bot.infer
export type CreateBotInput = typeof createInput.infer
export type StoredBot = typeof storedBot.infer
