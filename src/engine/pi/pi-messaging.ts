import type { InlineExtension } from "@earendil-works/pi-coding-agent"
import { reportTaskTool } from "@src/shared/tasks"
import { askTool, finishSilentlyTool, sendMessageTool } from "@src/shared/conversations"

export function createMessagingExtension(tools: string[]): InlineExtension {
  const assigned = tools.includes(reportTaskTool)
  const deliveries = assigned ? [reportTaskTool] : [sendMessageTool, askTool, finishSilentlyTool]

  return {
    name: "mimo-messaging",
    factory(pi) {
      let delivered = false
      let reminded = false

      pi.on("before_agent_start", () => {
        delivered = false
        reminded = false
      })

      pi.on("message_start", (event) => {
        if (event.message.role === "user") {
          delivered = false
          reminded = false
        }
      })

      pi.on("tool_result", (event) => {
        if (!event.isError && deliveries.includes(event.toolName)) {
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
          content: assigned
            ? "No Tarefa result has been delivered. Use report_task now: done with a self-contained result, or blocked with the information or decision needed. Progress is not the delivery. Do not repeat completed work."
            : `No answer has been delivered. Use send_message for the result or ask for a required choice.${tools.includes(finishSilentlyTool) ? " If this background check found nothing meaningful to communicate, use finish_silently." : ""} Progress and plain assistant text do not deliver an answer. Do not repeat completed work.`,
          display: false,
        }, { deliverAs: "followUp", triggerTurn: true })
      })
    },
  }
}
