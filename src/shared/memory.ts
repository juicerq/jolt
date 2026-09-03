import { z } from "zod"
import { messageAuthor } from "./conversations"
import { memoryLimits } from "./memory-limits"

const id = z.string().min(1)
const optionalId = id.nullable()
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
const memory = storedMemory.omit({ noteId: true }).extend({ turnAuthor: messageAuthor.nullable() })

export const memorySchemas = {
  botInput: z.strictObject({ botId: id }),
  idInput: z.strictObject({ id }),
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
