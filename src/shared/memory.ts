import { z } from "zod"
import { id, optionalId } from "./ids"
import { messageAuthor } from "./conversations"
import { memoryLimits } from "./memory-limits"
import { providerName, providerModelsList } from "./providers"

const memoryContent = id.max(memoryLimits.memory)
const note = z.strictObject({
  id,
  botId: id,
  content: id.max(memoryLimits.note),
  turnAuthor: messageAuthor,
  taskId: optionalId,
  messageId: optionalId,
  createdAt: id,
  curatedAt: id.nullable(),
})
const storedMemory = z.strictObject({
  id,
  botId: id,
  content: memoryContent,
  origin: z.enum(["person", "bot"]),
  noteId: optionalId,
  createdAt: id,
})
const memory = storedMemory.omit({ noteId: true }).extend({ source: note.nullable() })
const curationModel = z.strictObject({ provider: providerName, model: id }).nullable()
const curationFailure = z.strictObject({ botId: id, name: id, error: id })

export const memorySchemas = {
  curationModel,
  configure: z.strictObject({ model: curationModel }),
  settings: z.strictObject({ model: curationModel, providers: providerModelsList }),
  status: z.strictObject({ pending: z.number().int().nonnegative(), failures: z.array(curationFailure) }),
  addInput: z.strictObject({ botId: id, content: memoryContent }),
  updateInput: z.strictObject({ id, content: memoryContent }),
  note,
  noteList: z.array(note),
  storedMemory,
  memory,
  memoryList: z.array(memory),
}

export type Note = z.infer<typeof note>
export type StoredMemory = z.infer<typeof storedMemory>
export type Memory = z.infer<typeof memory>
export type CurationModel = z.infer<typeof curationModel>
export type CurationSettings = z.infer<typeof memorySchemas.settings>
export type ConfigureMemoryInput = z.infer<typeof memorySchemas.configure>
export type AddMemoryInput = z.infer<typeof memorySchemas.addInput>
export type UpdateMemoryInput = z.infer<typeof memorySchemas.updateInput>
