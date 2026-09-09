import { z } from "zod"
import { id, optionalId } from "./ids"
import { conversationSchemas, messageAuthor } from "./conversations"
import { memoryLimits } from "./memory-limits"
import { providerName, providerModelsList } from "./providers"

const memoryContent = id.max(memoryLimits.memory)
const source = z.strictObject({
  id,
  content: z.string(),
  author: messageAuthor,
  createdAt: id,
})
const storedMemory = z.strictObject({
  id,
  botId: id,
  content: memoryContent,
  origin: z.enum(["person", "bot"]),
  sourceMessageId: optionalId,
  supersededAt: id.nullable(),
  supersededByMessageId: optionalId,
  curationVersion: z.number().int().nonnegative(),
  createdAt: id,
})
const memory = storedMemory.omit({ curationVersion: true }).extend({ source: source.nullable(), supersededBy: source.nullable() })
const curationMessage = source.extend({ question: conversationSchemas.message.shape.question, replyTo: conversationSchemas.message.shape.replyTo })
const curationModel = z.strictObject({ provider: providerName, model: id }).nullable()
const curationFailure = z.strictObject({ botId: id, name: id, error: id })

export const memorySchemas = {
  curationModel,
  configure: z.strictObject({ model: curationModel }),
  settings: z.strictObject({ model: curationModel, providers: providerModelsList }),
  status: z.strictObject({ pending: z.number().int().nonnegative(), failures: z.array(curationFailure) }),
  addInput: z.strictObject({ botId: id, content: memoryContent }),
  updateInput: z.strictObject({ id, content: memoryContent }),
  source,
  batch: z.strictObject({ after: z.number().int(), through: z.number().int(), messages: z.array(curationMessage.extend({ position: z.number().int() })), context: curationMessage.nullable() }),
  search: z.strictObject({ query: id.max(300), after: z.iso.date().optional(), before: z.iso.date().optional(), offset: z.number().int().min(0).max(100_000).default(0) }),
  storedMemory,
  memory,
  memoryList: z.array(memory),
}

export type CurationBatch = z.infer<typeof memorySchemas.batch>
export type MemorySearch = z.infer<typeof memorySchemas.search>
export type StoredMemory = z.infer<typeof storedMemory>
export type Memory = z.infer<typeof memory>
export type CurationModel = z.infer<typeof curationModel>
export type CurationSettings = z.infer<typeof memorySchemas.settings>
export type ConfigureMemoryInput = z.infer<typeof memorySchemas.configure>
export type AddMemoryInput = z.infer<typeof memorySchemas.addInput>
export type UpdateMemoryInput = z.infer<typeof memorySchemas.updateInput>
