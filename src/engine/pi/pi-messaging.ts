import type { InlineExtension } from "@earendil-works/pi-coding-agent"
import { reportTaskTool } from "@src/shared/tasks"
import { askTool, sendMessageTool } from "@src/shared/conversations"

export function createMessagingExtension(assigned: boolean): InlineExtension {
  return {
    name: "mimo-messaging",
    factory(pi) {
      let delivered = false
      let reminded = false

      pi.on("before_agent_start", () => {
        delivered = false
        reminded = false
      })

      pi.on("tool_result", (event) => {
        if (!event.isError && (assigned ? event.toolName === reportTaskTool : event.toolName === sendMessageTool || event.toolName === askTool)) {
          delivered = true
        }
      })

      pi.on("turn_end", (event) => {
        if (event.message.role !== "assistant" || event.message.stopReason !== "stop" || delivered || reminded) {
          return
        }

        reminded = true
        pi.sendMessage({
          customType: "mimo.messaging-reminder",
          content: assigned ? "No Tarefa result has been delivered. Use report_task now: done with a self-contained result, or blocked with the information or decision needed. Progress sent with send_message is not the delivery. Do not repeat work already completed." : "No message has been delivered to the Mimo conversation. Send your answer with send_message now, one complete idea per call. If a choice is required, use ask. Do not repeat work already completed. Plain assistant text is not delivered.",
          display: false,
        }, { deliverAs: "followUp", triggerTurn: true })
      })
    },
  }
}
