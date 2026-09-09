import { askTool, conversationSchemas, finishSilentlyTool, sendMessageTool, type MessageQuestion } from "@src/shared/conversations"
import { reportTaskTool, taskSchemas, type TaskReport } from "@src/shared/tasks"
import { parse } from "@src/shared/parse"
import type { PiTool } from "../pi/pi-agent-runtime"

export function createConversationTools({ send, silence, report }: { send: (content: string, question: MessageQuestion | null) => void; silence?: () => void; report?: (result: TaskReport) => void }): PiTool[] {
  return [
    {
      name: sendMessageTool,
      description: "Send a message to the person in the current Mimo conversation. Plain assistant text is not delivered.",
      inputSchema: {
        type: "object",
        properties: { content: { type: "string", minLength: 1, description: "The message the person will read. Supports Markdown." } },
        required: ["content"],
        additionalProperties: false,
      },
      async execute(params: Record<string, unknown>, signal?: AbortSignal) {
        const { content } = parse(conversationSchemas.sendMessageToolInput, params)

        signal?.throwIfAborted()
        send(content, null)

        if (report) {
          return "Message saved in your conversation. Complete the Tarefa with report_task; this message is not forwarded to the requester."
        }

        return "Message delivered. Continue any unfinished work. When the request is complete, stop without repeating the answer."
      },
    },
    ...(silence ? [{
      name: finishSilentlyTool,
      description: "Finish a background check with no chat message or notification when there is no meaningful new result, blocker or decision for the person. Never use this to hide a failure, skip requested work or leave a direct question unanswered.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      async execute(params: Record<string, unknown>, signal?: AbortSignal) {
        parse(conversationSchemas.silentInput, params)
        signal?.throwIfAborted()
        silence()

        return "Silent completion recorded. Stop now."
      },
    } satisfies PiTool] : []),
    ...(report ? [{
      name: reportTaskTool,
      description: "Deliver your Tarefa result to the Bot who requested it, then stop. Use done for a completed request or blocked when you need information or a decision. Include the relevant evidence and limitations in one self-contained delivery; progress messages are not forwarded. If new instructions arrive afterward, address them and report again before stopping.",
      inputSchema: {
        type: "object",
        properties: { status: { type: "string", enum: ["done", "blocked"] }, content: { type: "string", minLength: 1 } },
        required: ["status", "content"],
        additionalProperties: false,
      },
      async execute(params: Record<string, unknown>, signal?: AbortSignal) {
        const result = parse(taskSchemas.taskReport, params)

        signal?.throwIfAborted()
        report(result)

        return "Tarefa report recorded. Stop now; Mimo delivers it when this turn finishes successfully."
      },
    } satisfies PiTool] : [{
      name: askTool,
      description: "Ask the person to choose between options. This sends the question and ends your turn: say what you need in content, list the options, then stop. Set multiple when more than one option can apply at once; the answer then lists every chosen option. Do not send the same question with send_message.",
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
          multiple: { type: "boolean", description: "Whether the person may choose more than one option" },
        },
        required: ["content", "options", "allowOther", "multiple"],
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
    } satisfies PiTool]),
  ]
}
