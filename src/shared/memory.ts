import { type } from "arktype"
import { messageAuthor } from "./conversations"
import { memoryLimits } from "./memory-limits"

const optionalId = type("string > 0").or("null")
const memoryContent = type("string > 0").atMostLength(memoryLimits.memory)
const note = type({
  "+": "reject",
  id: "string > 0",
  botId: "string > 0",
  content: type("string > 0").atMostLength(memoryLimits.note),
  turnAuthor: messageAuthor,
  taskId: optionalId,
  messageId: optionalId,
  createdAt: "string > 0",
  curatedAt: type("string > 0").or("null"),
})
const storedMemory = type({
  "+": "reject",
  id: "string > 0",
  botId: "string > 0",
  content: memoryContent,
  origin: type.enumerated("person", "bot"),
  noteId: optionalId,
  createdAt: "string > 0",
})
const memory = storedMemory.omit("noteId").merge({ turnAuthor: messageAuthor.or("null") })

export const memorySchemas = {
  botInput: type({ "+": "reject", botId: "string > 0" }),
  idInput: type({ "+": "reject", id: "string > 0" }),
  addInput: type({ "+": "reject", botId: "string > 0", content: memoryContent }),
  note,
  noteList: note.array(),
  storedMemory,
  memory,
  memoryList: memory.array(),
}

export type Note = typeof note.infer
export type StoredMemory = typeof storedMemory.infer
export type Memory = typeof memory.infer
