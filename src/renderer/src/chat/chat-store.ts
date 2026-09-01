import { Store } from "@tanstack/react-store"
import type { ConversationActivity, IncomingMessage } from "../../../shared/conversations"
import { nextChatWaitingMessage } from "./chat-waiting-messages"

type ConversationStep = ConversationActivity["steps"][number]
type ThinkingStep = Extract<ConversationStep, { type: "thinking" }>
type ToolStep = Extract<ConversationStep, { type: "tool" }>
type ToolActivity = Omit<ToolStep["tools"][number], "status"> & { status: "running" | "done" | "failed" }

export type ChatActivityStep =
  | (ThinkingStep & { status: "running" | "done" })
  | (Omit<ToolStep, "tools"> & { tools: ToolActivity[] })

export type ChatRun = {
  message: IncomingMessage
  responseContent: string
  steps: ChatActivityStep[]
  waitingMessage: string
  status: "running" | "aborting" | "failed"
  error?: string
}

type ChatState = {
  drafts: Record<string, string>
  runs: Record<string, ChatRun | undefined>
  statuses: Record<string, ChatStatus | undefined>
}

export type ChatStatus = "available" | "working" | "waiting" | "completed" | "error"

export const chatStore = new Store<ChatState>({ drafts: {}, runs: {}, statuses: {} })

export function setChatDraft(botId: string, draft: string) {
  chatStore.setState((state) => ({ ...state, drafts: { ...state.drafts, [botId]: draft } }))
}

export function startChatRun(botId: string, message: IncomingMessage) {
  chatStore.setState((state) => ({
    drafts: { ...state.drafts, [botId]: message.author === "person" ? "" : state.drafts[botId] ?? "" },
    runs: {
      ...state.runs,
      [botId]: { message, responseContent: "", steps: [], waitingMessage: nextChatWaitingMessage(), status: "running" },
    },
    statuses: { ...state.statuses, [botId]: "working" },
  }))
}

export function appendChatText(botId: string, text: string) {
  updateRun(botId, (run) => ({ ...run, responseContent: `${run.responseContent}${text}` }))
}

export function startChatThinking(botId: string) {
  updateRun(botId, (run) => ({ ...run, steps: [...run.steps, { type: "thinking", content: "", status: "running" }] }))
}

export function appendChatThinking(botId: string, text: string) {
  updateRun(botId, (run) => {
    const lastStep = run.steps.at(-1)

    if (lastStep?.type === "thinking") {
      return { ...run, steps: [...run.steps.slice(0, -1), { ...lastStep, content: `${lastStep.content}${text}` }] }
    }

    return { ...run, steps: [...run.steps, { type: "thinking", content: text, status: "running" }] }
  })
}

export function finishChatThinking(botId: string, durationMs: number) {
  updateRun(botId, (run) => ({
    ...run,
    steps: run.steps.map((step, index) => step.type === "thinking" && index === run.steps.length - 1
      ? { ...step, durationMs, status: "done" }
      : step),
  }))
}

export function startChatTool(botId: string, callId: string, name: string, detail?: string) {
  updateRun(botId, (run) => {
    const tool = { callId, name, ...(detail ? { detail } : {}), status: "running" as const }
    const lastStep = run.steps.at(-1)

    if (lastStep?.type === "tool" && lastStep.name === name) {
      return { ...run, steps: [...run.steps.slice(0, -1), { ...lastStep, tools: [...lastStep.tools, tool] }] }
    }

    return { ...run, steps: [...run.steps, { type: "tool", name, tools: [tool] }] }
  })
}

export function finishChatTool(botId: string, callId: string, failed: boolean) {
  updateRun(botId, (run) => ({
    ...run,
    steps: run.steps.map((step) => step.type === "tool"
      ? {
          ...step,
          tools: step.tools.map((tool) => tool.callId === callId
            ? { ...tool, status: failed ? "failed" as const : "done" as const }
            : tool),
        }
      : step),
  }))
}

export function markChatAborting(botId: string) {
  updateRun(botId, (run) => ({ ...run, status: "aborting" }))
  setChatStatus(botId, "waiting")
}

export function failChatRun(botId: string, error: string) {
  updateRun(botId, (run) => ({ ...run, status: "failed", error }))
  setChatStatus(botId, "error")
}

export function dismissChatRun(botId: string) {
  settleChatRun(botId, "available")
}

export function settleChatRun(botId: string, status: "available" | "completed" | "error") {
  chatStore.setState((state) => ({
    ...state,
    runs: { ...state.runs, [botId]: undefined },
    statuses: { ...state.statuses, [botId]: status },
  }))
}

function updateRun(botId: string, update: (run: ChatRun) => ChatRun) {
  chatStore.setState((state) => {
    const run = state.runs[botId]

    if (!run) {
      return state
    }

    return { ...state, runs: { ...state.runs, [botId]: update(run) } }
  })
}

function setChatStatus(botId: string, status: ChatStatus) {
  chatStore.setState((state) => ({ ...state, statuses: { ...state.statuses, [botId]: status } }))
}
