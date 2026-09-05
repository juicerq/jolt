import type { ConversationActivity, ConversationEvent, IncomingMessage } from "@src/shared/conversations"
import type { PiRuntimeEvent } from "../pi/pi-agent-runtime"

type ConversationStep = ConversationActivity["steps"][number]
type ThinkingStep = Extract<ConversationStep, { type: "thinking" }>
type ToolStep = Extract<ConversationStep, { type: "tool" }>
type ActiveTool = Omit<ToolStep["tools"][number], "status"> & { status: "running" | "done" | "failed" | "denied" }
type ActiveStep =
  | ThinkingStep
  | (Omit<ToolStep, "tools"> & { tools: ActiveTool[] })

export function createConversationActivityRecorder(messageId: string, message: IncomingMessage) {
  let thinkingStartedAt: number | undefined
  let steps: ActiveStep[] = []

  return {
    record(runtimeEvent: Exclude<PiRuntimeEvent, { type: "text" }>): ConversationEvent {
      if (runtimeEvent.type === "started") {
        thinkingStartedAt = undefined
        steps = []

        return { type: "started", messageId, message }
      }

      if (runtimeEvent.type === "thinking-started") {
        thinkingStartedAt = performance.now()
        steps.push({ type: "thinking", content: "" })

        return { type: "thinking-started" }
      }

      if (runtimeEvent.type === "thinking") {
        const lastStep = steps.at(-1)

        if (lastStep?.type === "thinking") {
          lastStep.content += runtimeEvent.text
        } else {
          steps.push({ type: "thinking", content: runtimeEvent.text })
        }

        return runtimeEvent
      }

      if (runtimeEvent.type === "thinking-finished") {
        const durationMs = finishThinking()

        return { type: "thinking-finished", durationMs }
      }

      if (runtimeEvent.type === "tool-started") {
        const tool = { callId: runtimeEvent.callId, name: runtimeEvent.tool, ...(runtimeEvent.label ? { label: runtimeEvent.label } : {}), ...(runtimeEvent.detail ? { detail: runtimeEvent.detail } : {}), ...(runtimeEvent.brief ? { brief: runtimeEvent.brief } : {}), status: "running" as const }
        const lastStep = steps.at(-1)

        if (lastStep?.type === "tool" && lastStep.name === runtimeEvent.tool) {
          lastStep.tools.push(tool)
        } else {
          steps.push({ type: "tool", name: runtimeEvent.tool, tools: [tool] })
        }

        return runtimeEvent
      }

      if (runtimeEvent.type === "tool-finished") {
        steps = steps.map((step) => step.type === "tool"
          ? {
              ...step,
              tools: step.tools.map((tool) => tool.callId === runtimeEvent.callId
                ? { ...tool, status: finishedStatus(runtimeEvent), ...(runtimeEvent.error ? { error: runtimeEvent.error } : {}) }
                : tool),
            }
          : step)

        return runtimeEvent
      }

      if (runtimeEvent.type === "finished" && thinkingStartedAt !== undefined) {
        finishThinking()
      }

      if (runtimeEvent.type === "message-finished") {
        return { type: "message-finished" }
      }

      return runtimeEvent
    },
    takeSnapshot(): ConversationActivity {
      const snapshot = {
        steps: steps.flatMap((step): ConversationActivity["steps"] => {
          if (step.type === "thinking") {
            if (!step.content && !step.durationMs) {
              return []
            }

            return [step]
          }

          const tools = step.tools.filter((tool): tool is ToolStep["tools"][number] => tool.status !== "running")

          if (tools.length === 0) {
            return []
          }

          return [{ type: "tool", name: step.name, tools }]
        }),
      }

      thinkingStartedAt = undefined
      steps = []

      return snapshot
    },
  }

  function finishThinking() {
    const durationMs = Math.max(1, Math.round(performance.now() - (thinkingStartedAt ?? performance.now())))
    const lastStep = steps.at(-1)

    if (lastStep?.type === "thinking") {
      lastStep.durationMs = durationMs
    }

    thinkingStartedAt = undefined

    return durationMs
  }
}

function finishedStatus(event: { failed: boolean; denied?: boolean }) {
  if (event.denied) {
    return "denied" as const
  }

  if (event.failed) {
    return "failed" as const
  }

  return "done" as const
}
