import { type } from "arktype"
import { providerName } from "./providers"

const botFunction = type({ "+": "reject", outcome: "string > 0", responsibilities: "string > 0", limits: "string > 0", delivery: "string > 0" })
const workingDirectory = type("string > 0")
const bot = type({ "+": "reject", id: "string > 0", leaderBotId: type("string > 0").or("null"), name: "string > 0", provider: providerName, function: botFunction, workingDirectory: workingDirectory.or("null"), createdAt: "string > 0" })

export const botSchemas = {
  createInput: type({ "+": "reject", name: "string > 0", provider: providerName, function: botFunction, "workingDirectory?": workingDirectory }),
  idInput: type({ "+": "reject", id: "string > 0" }),
  updateWorkingDirectoryInput: type({ "+": "reject", id: "string > 0", workingDirectory: workingDirectory.or("null") }),
  bot,
  botList: bot.array(),
}

export type Bot = typeof bot.infer
