import { askTool, conversationSchemas, messageContentLimit, sendMessageTool, type MessageQuestion } from "@src/shared/conversations"
import { parse } from "@src/shared/parse"
import type { PiTool } from "../pi/pi-agent-runtime"

export function createConversationTools(send: (content: string, question: MessageQuestion | null) => void): PiTool[] {
  return [
    {
      name: sendMessageTool,
      description: "Send one message to the current Mimo conversation immediately. Each message develops one idea, usually in two or three sentences. You can send another message or use other tools afterward without waiting for a reply. Use successive calls for detailed explanations. Plain assistant text is not delivered to the person.",
      inputSchema: {
        type: "object",
        properties: { content: { type: "string", minLength: 1, maxLength: messageContentLimit, description: "One complete conversational idea for the person to read. Split a longer explanation into successive calls." } },
        required: ["content"],
        additionalProperties: false,
      },
      async execute(params: Record<string, unknown>, signal?: AbortSignal) {
        const { content } = parse(conversationSchemas.sendMessageToolInput, params)

        signal?.throwIfAborted()
        send(content, null)

        return "Message delivered. Continue with the next idea or action if needed. When the request is complete, stop without repeating the messages in plain text."
      },
    },
    {
      name: askTool,
      description: "Ask the person to choose between options. This sends the question and ends your turn: say what you need in content, list the options, then stop. Do not send the same question with send_message.",
      inputSchema: {
        type: "object",
        properties: {
          content: { type: "string", description: "The question the person will read" },
          options: {
            type: "array",
            minItems: 2,
            maxItems: 12,
            items: {
              type: "object",
              properties: {
                value: { type: "string", description: "A short stable value for this option" },
                label: { type: "string", description: "The option shown to the person" },
                description: { type: "string", description: "Optional detail that distinguishes this option" },
              },
              required: ["value", "label"],
              additionalProperties: false,
            },
          },
          allowOther: { type: "boolean", description: "Whether the person may write a different answer" },
        },
        required: ["content", "options", "allowOther"],
        additionalProperties: false,
      },
      async execute(params: Record<string, unknown>, signal?: AbortSignal) {
        const { content, ...question } = parse(conversationSchemas.askToolInput, params)

        if (new Set(question.options.map((option) => option.value)).size !== question.options.length) {
          throw new Error("Question option values must be unique")
        }

        signal?.throwIfAborted()
        send(content, question)

        return "Question sent. Stop now and wait for the person to answer in a new turn."
      },
    },
  ]
}
