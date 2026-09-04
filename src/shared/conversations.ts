import { z } from "zod"
import { messageImageMimeTypes } from "./message-images"
import { permissionSchemas } from "./permissions"
import { pluginSchemas } from "./plugins"
import type { Frequency } from "./routines"
import type { TaskStatus } from "./tasks"

export const sendMessageTool = "send_message"

const id = z.string().min(1)
export const messageAuthor = z.enum(["person", "bot", "routine"])
const optionalId = id.nullable()
const messageImage = z.strictObject({ data: id, mimeType: z.enum(messageImageMimeTypes) })
const messageQuestionOption = z.strictObject({
  value: id.max(100),
  label: id.max(80),
  description: id.max(160).optional(),
})
const messageQuestion = z.strictObject({
  options: z.array(messageQuestionOption).min(2).max(12),
  allowOther: z.boolean(),
})
const messageReply = z.strictObject({ messageId: id, optionValue: id.max(100) })
const conversationTool = z.strictObject({
  callId: id,
  name: id,
  label: id.optional(),
  detail: id.optional(),
  brief: id.optional(),
  status: z.enum(["done", "failed", "denied"]),
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
  question: messageQuestion.nullable().optional(),
  replyTo: messageReply.nullable().optional(),
  activity: conversationActivity.nullable(),
  ending: turnEnding.nullable(),
  error: z.string().min(1).max(500).nullish(),
  createdAt: id,
})
const incomingMessage = message.pick({ author: true, authorBotId: true, taskId: true, content: true, images: true, replyTo: true })
const messageToolInput = z.strictObject({ content: z.string().trim().min(1), question: messageQuestion.optional() })
const startedEvent = z.strictObject({ type: z.literal("started"), message: incomingMessage })
const textEvent = z.strictObject({ type: z.literal("text"), text: z.string() })
const messageFinishedEvent = z.strictObject({ type: z.literal("message-finished"), message: message.optional() })
const thinkingEvent = z.strictObject({ type: z.literal("thinking"), text: z.string() })
const thinkingStartedEvent = z.strictObject({ type: z.literal("thinking-started") })
const thinkingFinishedEvent = z.strictObject({ type: z.literal("thinking-finished"), durationMs: z.int().positive() })
const toolStartedEvent = z.strictObject({
  type: z.literal("tool-started"),
  callId: id,
  tool: id,
  label: id.optional(),
  detail: id.optional(),
  brief: id.optional(),
})
const toolFinishedEvent = z.strictObject({
  type: z.literal("tool-finished"),
  callId: id,
  tool: id,
  failed: z.boolean(),
  denied: z.boolean().optional(),
  error: id.optional(),
})
const permissionRequestedEvent = z.strictObject({ type: z.literal("permission-requested"), request: permissionSchemas.request })
const permissionResolvedEvent = z.strictObject({ type: z.literal("permission-resolved"), requestId: id })
const pluginRequestedEvent = z.strictObject({ type: z.literal("plugin-requested"), request: pluginSchemas.request })
const pluginResolvedEvent = z.strictObject({ type: z.literal("plugin-resolved"), requestId: id })
const compactionStartedEvent = z.strictObject({ type: z.literal("compaction-started"), reason: z.enum(["manual", "threshold", "overflow"]) })
const compactionFinishedEvent = z.strictObject({ type: z.literal("compaction-finished") })
const finishedEvent = z.strictObject({ type: z.literal("finished"), reason: z.enum(["stop", "aborted", "error"]), error: z.string().min(1).max(500).optional() })
const event = z.discriminatedUnion("type", [
  startedEvent,
  textEvent,
  messageFinishedEvent,
  thinkingStartedEvent,
  thinkingEvent,
  thinkingFinishedEvent,
  toolStartedEvent,
  toolFinishedEvent,
  permissionRequestedEvent,
  permissionResolvedEvent,
  pluginRequestedEvent,
  pluginResolvedEvent,
  compactionStartedEvent,
  compactionFinishedEvent,
  finishedEvent,
])
const botEvent = z.strictObject({ botId: id, event })
const history = z.strictObject({ messages: z.array(message), earlier: z.int().nonnegative() })
const compactionResult = z.strictObject({
  tokensBefore: z.int().nonnegative(),
  estimatedTokensAfter: z.int().nonnegative().optional(),
})

export const conversationSchemas = {
  botInput: z.strictObject({ botId: id }),
  compactInput: z.strictObject({ botId: id, instructions: z.string().trim().min(1).optional() }),
  compactionResult,
  historyInput: z.strictObject({ botId: id, before: id.optional(), limit: z.int().min(1).max(500) }),
  history,
  sendInput: z.strictObject({ botId: id, content: z.string(), images: z.array(messageImage), replyTo: messageReply.nullable().default(null), mentionedBotIds: z.array(id).default([]) }),
  messageToolInput,
  taskInput: z.strictObject({ taskId: id }),
  message,
  messageList: z.array(message),
  event,
  botEvent,
}

export type ConversationMessage = z.infer<typeof message>
export type MessageImage = z.infer<typeof messageImage>
export type MessageQuestion = z.infer<typeof messageQuestion>
export type MessageReply = z.infer<typeof messageReply>
export type TurnEnding = z.infer<typeof turnEnding>
export type ConversationEvent = z.infer<typeof event>
export type FinishReason = z.infer<typeof finishedEvent>["reason"]
export type BotConversationEvent = z.infer<typeof botEvent>
export type IncomingMessage = z.infer<typeof incomingMessage>
export type ConversationActivity = z.infer<typeof conversationActivity>
export type HistoryPage = z.infer<typeof conversationSchemas.history>
export type ConversationCompactionResult = z.infer<typeof compactionResult>
export type TurnContext = { startedAt: string; timeZone: string } & (
  | { cause: "person" }
  | { cause: "routine"; routineId: string; frequency: Frequency; scheduledFor: string }
  | { cause: "task-assignment"; taskId: string; sender: { id: string; name: string }; outcome: string }
  | { cause: "task-result"; taskId: string; sender: { id: string; name: string }; outcome: string; status: TaskStatus }
)
