import { z } from "zod"
import { messageImageMimeTypes } from "./message-images"

const id = z.string().min(1)
export const messageAuthor = z.enum(["person", "bot", "routine"])
const optionalId = id.nullable()
const messageImage = z.strictObject({ data: id, mimeType: z.enum(messageImageMimeTypes) })
const conversationTool = z.strictObject({
  callId: id,
  name: id,
  detail: id.optional(),
  brief: id.optional(),
  status: z.enum(["done", "failed"]),
  error: id.optional(),
})
const thinkingActivityStep = z.strictObject({
  type: z.literal("thinking"),
  content: z.string(),
  durationMs: z.int().positive().optional(),
})
const toolActivityStep = z.strictObject({
  type: z.literal("tool"),
  name: id,
  tools: z.array(conversationTool),
})
const conversationActivity = z.strictObject({
  steps: z.array(z.discriminatedUnion("type", [thinkingActivityStep, toolActivityStep])),
})
const turnEnding = z.enum(["aborted", "failed", "closed"])
const message = z.strictObject({
  id,
  botId: id,
  author: messageAuthor,
  authorBotId: optionalId,
  taskId: optionalId,
  content: z.string(),
  images: z.array(messageImage),
  activity: conversationActivity.nullable(),
  ending: turnEnding.nullable(),
  createdAt: id,
})
const incomingMessage = message.pick({ author: true, authorBotId: true, taskId: true, content: true, images: true })
const startedEvent = z.strictObject({ type: z.literal("started"), message: incomingMessage })
const textEvent = z.strictObject({ type: z.literal("text"), text: z.string() })
const thinkingEvent = z.strictObject({ type: z.literal("thinking"), text: z.string() })
const thinkingStartedEvent = z.strictObject({ type: z.literal("thinking-started") })
const thinkingFinishedEvent = z.strictObject({ type: z.literal("thinking-finished"), durationMs: z.int().positive() })
const toolStartedEvent = z.strictObject({
  type: z.literal("tool-started"),
  callId: id,
  tool: id,
  detail: id.optional(),
  brief: id.optional(),
})
const toolFinishedEvent = z.strictObject({
  type: z.literal("tool-finished"),
  callId: id,
  tool: id,
  failed: z.boolean(),
  error: id.optional(),
})
const finishedEvent = z.strictObject({ type: z.literal("finished"), reason: z.enum(["stop", "aborted", "error"]) })
const event = z.discriminatedUnion("type", [
  startedEvent,
  textEvent,
  thinkingStartedEvent,
  thinkingEvent,
  thinkingFinishedEvent,
  toolStartedEvent,
  toolFinishedEvent,
  finishedEvent,
])
const botEvent = z.strictObject({ botId: id, event })
const history = z.strictObject({ messages: z.array(message), earlier: z.int().nonnegative() })

export const conversationSchemas = {
  botInput: z.strictObject({ botId: id }),
  historyInput: z.strictObject({ botId: id, before: id.optional(), limit: z.int().min(1).max(500) }),
  history,
  sendInput: z.strictObject({ botId: id, content: z.string(), images: z.array(messageImage) }),
  taskInput: z.strictObject({ taskId: id }),
  message,
  messageList: z.array(message),
  event,
  botEvent,
}

export type ConversationMessage = z.infer<typeof message>
export type MessageImage = z.infer<typeof messageImage>
export type TurnEnding = z.infer<typeof turnEnding>
export type ConversationEvent = z.infer<typeof event>
export type FinishReason = z.infer<typeof finishedEvent>["reason"]
export type BotConversationEvent = z.infer<typeof botEvent>
export type IncomingMessage = z.infer<typeof incomingMessage>
export type ConversationActivity = z.infer<typeof conversationActivity>
export type HistoryPage = z.infer<typeof conversationSchemas.history>
