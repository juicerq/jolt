import { type } from "arktype"
import { providerName } from "./providers"

const botFunction = type({ "+": "reject", outcome: "string > 0", responsibilities: "string > 0", limits: "string > 0", delivery: "string > 0" })
const bot = type({ "+": "reject", id: "string > 0", leaderBotId: type("string > 0").or("null"), name: "string > 0", provider: providerName, function: botFunction, createdAt: "string > 0" })

export const botSchemas = {
  createInput: type({ "+": "reject", name: "string > 0", provider: providerName, function: botFunction }),
  idInput: type({ "+": "reject", id: "string > 0" }),
  bot,
  botList: bot.array(),
}

export type Bot = typeof bot.infer
