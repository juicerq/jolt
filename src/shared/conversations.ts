import { type } from "arktype"

const messageAuthor = type.enumerated("person", "bot")
const optionalId = type("string > 0").or("null")
const conversationTool = type({
  "+": "reject",
  callId: "string > 0",
  name: "string > 0",
  "detail?": "string > 0",
  status: type.enumerated("done", "failed"),
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
const legacyConversationActivityInput = type({
  "+": "reject",
  thinkingContent: "string",
  "thinkingDurationMs?": "number.integer > 0",
  tools: conversationTool.array(),
})
const legacyConversationActivity = legacyConversationActivityInput.pipe((activity) => {
  const steps: (typeof conversationActivity.infer)["steps"] = []

  if (activity.thinkingContent || activity.thinkingDurationMs) {
    steps.push({ type: "thinking", content: activity.thinkingContent, ...(activity.thinkingDurationMs ? { durationMs: activity.thinkingDurationMs } : {}) })
  }

  for (const tool of activity.tools) {
    const lastStep = steps.at(-1)

    if (lastStep?.type === "tool" && lastStep.name === tool.name) {
      lastStep.tools.push(tool)
    } else {
      steps.push({ type: "tool", name: tool.name, tools: [tool] })
    }
  }

  return conversationActivity.assert({ steps })
})
const compatibleConversationActivity = conversationActivity.or(legacyConversationActivity)
const message = type({
  "+": "reject",
  id: "string > 0",
  botId: "string > 0",
  author: messageAuthor,
  authorBotId: optionalId,
  taskId: optionalId,
  content: "string > 0",
  activity: compatibleConversationActivity.or("null"),
  createdAt: "string > 0",
})
const startedEvent = type({ "+": "reject", type: type.enumerated("started") })
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
})
const toolFinishedEvent = type({
  "+": "reject",
  type: type.enumerated("tool-finished"),
  callId: "string > 0",
  tool: "string > 0",
  failed: "boolean",
})
const finishedEvent = type({ "+": "reject", type: type.enumerated("finished"), reason: type.enumerated("stop", "aborted", "error") })

export const conversationSchemas = {
  botInput: type({ "+": "reject", botId: "string > 0" }),
  sendInput: type({ "+": "reject", botId: "string > 0", content: "string > 0" }),
  taskInput: type({ "+": "reject", taskId: "string > 0" }),
  message,
  messageList: message.array(),
  event: startedEvent.or(textEvent).or(thinkingStartedEvent).or(thinkingEvent).or(thinkingFinishedEvent).or(toolStartedEvent).or(toolFinishedEvent).or(finishedEvent),
}

export type ConversationMessage = typeof message.infer
export type ConversationEvent = typeof conversationSchemas.event.infer
export type ConversationActivity = typeof conversationActivity.infer
