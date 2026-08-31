import { type } from "arktype"

const messageAuthor = type.enumerated("person", "bot")
const message = type({
  "+": "reject",
  id: "string > 0",
  botId: "string > 0",
  author: messageAuthor,
  content: "string > 0",
  createdAt: "string > 0",
})
const startedEvent = type({ "+": "reject", type: type.enumerated("started") })
const textEvent = type({ "+": "reject", type: type.enumerated("text"), text: "string" })
const toolStartedEvent = type({ "+": "reject", type: type.enumerated("tool-started"), tool: "string > 0" })
const toolFinishedEvent = type({ "+": "reject", type: type.enumerated("tool-finished"), tool: "string > 0", failed: "boolean" })
const finishedEvent = type({ "+": "reject", type: type.enumerated("finished"), reason: type.enumerated("stop", "aborted", "error") })

export const conversationSchemas = {
  botInput: type({ "+": "reject", botId: "string > 0" }),
  sendInput: type({ "+": "reject", botId: "string > 0", content: "string > 0" }),
  message,
  messageList: message.array(),
  event: startedEvent.or(textEvent).or(toolStartedEvent).or(toolFinishedEvent).or(finishedEvent),
}

export type ConversationMessage = typeof message.infer
export type ConversationEvent = typeof conversationSchemas.event.infer
