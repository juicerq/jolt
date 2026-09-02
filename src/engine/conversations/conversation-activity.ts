import { conversationSchemas, type ConversationActivity, type ConversationEvent, type IncomingMessage } from "../../shared/conversations"
import type { PiRuntimeEvent } from "../pi/pi-agent-runtime"
import { parse } from "../../shared/parse"

type ConversationStep = ConversationActivity["steps"][number]
type ThinkingStep = Extract<ConversationStep, { type: "thinking" }>
type ToolStep = Extract<ConversationStep, { type: "tool" }>
type ActiveTool = Omit<ToolStep["tools"][number], "status"> & { status: "running" | "done" | "failed" }
type ActiveStep =
  | (ThinkingStep & { startedAt?: number })
  | (Omit<ToolStep, "tools"> & { tools: ActiveTool[] })

export function createConversationActivityRecorder(message: IncomingMessage) {
  let thinkingStartedAt: number | undefined
  let steps: ActiveStep[] = []

  return {
    record(runtimeEvent: PiRuntimeEvent): ConversationEvent {
      if (runtimeEvent.type === "started") {
        thinkingStartedAt = undefined
        steps = []

        return { type: "started", message }
      }

      if (runtimeEvent.type === "thinking-started") {
        thinkingStartedAt = performance.now()
        steps.push({ type: "thinking", content: "", startedAt: thinkingStartedAt })

        return { type: "thinking-started" }
      }

      if (runtimeEvent.type === "thinking") {
        const lastStep = steps.at(-1)

        if (lastStep?.type === "thinking") {
          lastStep.content += runtimeEvent.text
        } else {
          steps.push({ type: "thinking", content: runtimeEvent.text })
        }

        return parse(conversationSchemas.event, runtimeEvent)
      }

      if (runtimeEvent.type === "thinking-finished") {
        const durationMs = finishThinking()

        return { type: "thinking-finished", durationMs }
      }

      if (runtimeEvent.type === "tool-started") {
        const tool = { callId: runtimeEvent.callId, name: runtimeEvent.tool, ...(runtimeEvent.detail ? { detail: runtimeEvent.detail } : {}), ...(runtimeEvent.brief ? { brief: runtimeEvent.brief } : {}), status: "running" as const }
        const lastStep = steps.at(-1)

        if (lastStep?.type === "tool" && lastStep.name === runtimeEvent.tool) {
          lastStep.tools.push(tool)
        } else {
          steps.push({ type: "tool", name: runtimeEvent.tool, tools: [tool] })
        }

        return parse(conversationSchemas.event, runtimeEvent)
      }

      if (runtimeEvent.type === "tool-finished") {
        steps = steps.map((step) => step.type === "tool"
          ? {
              ...step,
              tools: step.tools.map((tool) => tool.callId === runtimeEvent.callId
                ? { ...tool, status: runtimeEvent.failed ? "failed" as const : "done" as const, ...(runtimeEvent.error ? { error: runtimeEvent.error } : {}) }
                : tool),
            }
          : step)

        return parse(conversationSchemas.event, runtimeEvent)
      }

      if (runtimeEvent.type === "finished" && thinkingStartedAt !== undefined) {
        finishThinking()
      }

      return parse(conversationSchemas.event, runtimeEvent)
    },
    snapshot(): ConversationActivity {
      return {
        steps: steps.flatMap((step): ConversationActivity["steps"] => {
          if (step.type === "thinking") {
            const { startedAt, ...thinkingStep } = step

            return thinkingStep.content || thinkingStep.durationMs ? [thinkingStep] : []
          }

          const tools = step.tools.filter((tool): tool is ToolStep["tools"][number] => tool.status !== "running")

          return tools.length > 0 ? [{ type: "tool", name: step.name, tools }] : []
        }),
      }
    },
  }

  function finishThinking() {
    const durationMs = Math.max(1, Math.round(performance.now() - (thinkingStartedAt ?? performance.now())))
    const lastStep = steps.at(-1)

    if (lastStep?.type === "thinking") {
      lastStep.durationMs = durationMs
      delete lastStep.startedAt
    }

    thinkingStartedAt = undefined

    return durationMs
  }
}
