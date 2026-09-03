import type { ExtensionAPI, InlineExtension } from "@earendil-works/pi-coding-agent"
import { sendMessageTool } from "../../shared/conversations"

const openingRequired = "Send a short opening message before starting work. Confirm what you understood and name the first step, then call this tool again."
const answerRequired = "You already sent a question. Stop now and wait for the person to answer in a new turn."

export function createMessageProtocolExtension(): InlineExtension {
  return {
    name: "message-protocol",
    factory(pi: ExtensionAPI) {
      let opened = false
      let questionSent = false

      pi.on("agent_start", () => {
        opened = false
        questionSent = false
      })

      pi.on("tool_call", (event) => {
        if (questionSent) {
          return { block: true, reason: answerRequired }
        }

        if (event.toolName !== sendMessageTool && !opened) {
          return { block: true, reason: openingRequired }
        }
      })

      pi.on("tool_result", (event) => {
        if (event.toolName === sendMessageTool && !event.isError) {
          opened = true
          questionSent = event.input.question !== undefined
        }
      })
    },
  }
}
