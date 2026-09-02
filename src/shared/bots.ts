import { z } from "zod"
import { botEfforts } from "./bot-efforts"
import { botPermissionModes } from "./bot-permissions"
import { providerName } from "./providers"

const id = z.string().min(1)
const botFunction = z.strictObject({ outcome: id, description: id.optional() })
const botEffort = z.enum(botEfforts)
const botPermissionMode = z.enum(botPermissionModes)
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
  permissionMode: botPermissionMode,
  createdAt: id,
})
const bot = storedBot.extend({ effectiveWorkingDirectory: workingDirectory, closed: z.boolean() })
const createFields = { name: id, provider: providerName, function: botFunction, workingDirectoryOverride: workingDirectory.optional() }
const createInput = z.union([
  z.strictObject({ ...createFields, projectId: id.optional() }),
  z.strictObject({ ...createFields, leaderBotId: id }),
])
const updateExecutionInput = z.discriminatedUnion("setting", [
  z.strictObject({ id, setting: z.literal("effort"), value: botEffort }),
  z.strictObject({ id, setting: z.literal("model"), value: optionalId }),
  z.strictObject({ id, setting: z.literal("permissionMode"), value: botPermissionMode }),
])

export const botSchemas = {
  createInput,
  hireInput: z.strictObject({ name: id, function: botFunction, permanent: z.boolean() }),
  idInput: z.strictObject({ id }),
  updateInput: z.strictObject({ id, name: id, function: botFunction, projectId: optionalId, workingDirectoryOverride: workingDirectory.nullable(), memoryEnabled: z.boolean(), effort: botEffort, model: optionalId, permissionMode: botPermissionMode }),
  updateExecutionInput,
  storedBot,
  storedBotList: z.array(storedBot),
  bot,
  botList: z.array(bot),
}

export type Bot = z.infer<typeof bot>
export type CreateBotInput = z.infer<typeof createInput>
export type StoredBot = z.infer<typeof storedBot>
export type BotEffort = z.infer<typeof botEffort>
export type BotExecutionSettingInput = z.infer<typeof updateExecutionInput>
export type BotExecutionSettingChange = BotExecutionSettingInput extends infer Change
  ? Change extends { id: string } ? Omit<Change, "id"> : never
  : never
