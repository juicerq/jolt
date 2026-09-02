import { z } from "zod"
import { botEfforts } from "./bot-efforts"
import { providerName } from "./providers"

const id = z.string().min(1)
const botFunction = z.strictObject({ outcome: id, description: id.optional() })
const botEffort = z.enum(botEfforts)
export const workingDirectory = z.string().min(1)
const optionalId = id.nullable()
const storedBot = z.strictObject({
  id,
  leaderBotId: optionalId,
  projectId: optionalId,
  name: id,
  provider: providerName,
  function: botFunction,
  workingDirectoryOverride: workingDirectory.nullable(),
  temporary: z.boolean(),
  memoryEnabled: z.boolean(),
  effort: botEffort,
  model: optionalId,
  createdAt: id,
})
const bot = storedBot.extend({ effectiveWorkingDirectory: workingDirectory, closed: z.boolean() })
const createFields = { name: id, provider: providerName, function: botFunction, workingDirectoryOverride: workingDirectory.optional() }
const createInput = z.union([
  z.strictObject({ ...createFields, projectId: id.optional() }),
  z.strictObject({ ...createFields, leaderBotId: id }),
])

export const botSchemas = {
  createInput,
  hireInput: z.strictObject({ name: id, function: botFunction, permanent: z.boolean() }),
  idInput: z.strictObject({ id }),
  updateInput: z.strictObject({ id, name: id, function: botFunction, projectId: optionalId, workingDirectoryOverride: workingDirectory.nullable(), memoryEnabled: z.boolean(), effort: botEffort, model: optionalId }),
  storedBot,
  storedBotList: z.array(storedBot),
  bot,
  botList: z.array(bot),
}

export type Bot = z.infer<typeof bot>
export type CreateBotInput = z.infer<typeof createInput>
export type StoredBot = z.infer<typeof storedBot>
export type BotEffort = z.infer<typeof botEffort>
