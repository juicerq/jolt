import type { ExtensionAPI, InlineExtension } from "@earendil-works/pi-coding-agent"
import { sendMessageTool } from "@src/shared/conversations"

const openingRequired = "Call send_message first, before any other tool. Confirm what you understood and name the first step you are taking, then make this call again."
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
