import { type } from "arktype"

export const messageAuthor = type.enumerated("person", "bot", "routine")
export const messageImageMimeTypes = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const
const optionalId = type("string > 0").or("null")
const messageImage = type({ "+": "reject", data: "string > 0", mimeType: type.enumerated(...messageImageMimeTypes) })
const conversationTool = type({
  "+": "reject",
  callId: "string > 0",
  name: "string > 0",
  "detail?": "string > 0",
  "brief?": "string > 0",
  status: type.enumerated("done", "failed"),
  "error?": "string > 0",
})
const thinkingActivityStep = type({
  "+": "reject",
  type: type.enumerated("thinking"),
  content: "string",
  "durationMs?": "number.integer > 0",
})
const toolActivityStep = type({
  "+": "reject",
  type: type.enumerated("tool"),
  name: "string > 0",
  tools: conversationTool.array(),
})
const conversationActivity = type({
  "+": "reject",
  steps: thinkingActivityStep.or(toolActivityStep).array(),
})
const turnEnding = type.enumerated("aborted", "failed", "closed")
const message = type({
  "+": "reject",
  id: "string > 0",
  botId: "string > 0",
  author: messageAuthor,
  authorBotId: optionalId,
  taskId: optionalId,
  content: "string",
  images: messageImage.array(),
  activity: conversationActivity.or("null"),
  ending: turnEnding.or("null"),
  createdAt: "string > 0",
})
const incomingMessage = message.pick("author", "authorBotId", "taskId", "content", "images")
const startedEvent = type({ "+": "reject", type: type.enumerated("started"), message: incomingMessage })
const textEvent = type({ "+": "reject", type: type.enumerated("text"), text: "string" })
const thinkingEvent = type({ "+": "reject", type: type.enumerated("thinking"), text: "string" })
const thinkingStartedEvent = type({ "+": "reject", type: type.enumerated("thinking-started") })
const thinkingFinishedEvent = type({ "+": "reject", type: type.enumerated("thinking-finished"), durationMs: "number.integer > 0" })
const toolStartedEvent = type({
  "+": "reject",
  type: type.enumerated("tool-started"),
  callId: "string > 0",
  tool: "string > 0",
  "detail?": "string > 0",
  "brief?": "string > 0",
})
const toolFinishedEvent = type({
  "+": "reject",
  type: type.enumerated("tool-finished"),
  callId: "string > 0",
  tool: "string > 0",
  failed: "boolean",
  "error?": "string > 0",
})
const finishedEvent = type({ "+": "reject", type: type.enumerated("finished"), reason: type.enumerated("stop", "aborted", "error") })
const event = startedEvent.or(textEvent).or(thinkingStartedEvent).or(thinkingEvent).or(thinkingFinishedEvent).or(toolStartedEvent).or(toolFinishedEvent).or(finishedEvent)
const botEvent = type({ "+": "reject", botId: "string > 0", event })

export const conversationSchemas = {
  botInput: type({ "+": "reject", botId: "string > 0" }),
  sendInput: type({ "+": "reject", botId: "string > 0", content: "string", images: messageImage.array() }),
  taskInput: type({ "+": "reject", taskId: "string > 0" }),
  message,
  messageList: message.array(),
  event,
  botEvent,
}

export type ConversationMessage = typeof message.infer
export type MessageImage = typeof messageImage.infer
export type TurnEnding = typeof turnEnding.infer
export type ConversationEvent = typeof event.infer
export type FinishReason = typeof finishedEvent.infer["reason"]
export type BotConversationEvent = typeof botEvent.infer
export type IncomingMessage = typeof incomingMessage.infer
export type ConversationActivity = typeof conversationActivity.infer
