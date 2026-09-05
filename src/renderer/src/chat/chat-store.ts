import { Store } from "@tanstack/react-store"
import type { ConversationActivity, ConversationMessage, IncomingMessage, QueuedMessage } from "@src/shared/conversations"
import type { PermissionRequest } from "@src/shared/permissions"
import type { PluginRequest, PluginStep } from "@src/shared/plugins"
import type { ChatCommandName } from "./chat-commands"
import type { ChatMention } from "./chat-mentions"
import { nextChatWaitingMessage } from "./chat-waiting-messages"

type ConversationStep = ConversationActivity["steps"][number]
type ThinkingStep = Extract<ConversationStep, { type: "thinking" }>
type ToolStep = Extract<ConversationStep, { type: "tool" }>
type ToolActivity = Omit<ToolStep["tools"][number], "status"> & { status: "running" | "done" | "failed" | "denied" }

type ChatActivityStep =
  | (ThinkingStep & { status: "running" | "done" })
  | (Omit<ToolStep, "tools"> & { tools: ToolActivity[] })

export interface ChatRun {
  messageId: string
  message: IncomingMessage
  completedMessages: ConversationMessage[]
  steps: ChatActivityStep[]
  waitingMessage: string
  compacting: boolean
  status: "running" | "aborting" | "failed"
  permissionRequests: PermissionRequest[]
  pluginRequests: PluginRequest[]
  pluginSteps: Record<string, PluginStep>
  error?: string
}

export type ChatDraft = Pick<IncomingMessage, "content" | "images"> & { mentions: ChatMention[]; command?: ChatCommandName }

interface ChatState {
  drafts: Record<string, ChatDraft>
  runs: Record<string, ChatRun | undefined>
  statuses: Record<string, ChatStatus | undefined>
  queued: Record<string, QueuedMessage[] | undefined>
}

export type ChatStatus = "available" | "working" | "awaiting-decision" | "awaiting-response" | "waiting" | "completed" | "error"

export const emptyChatDraft: ChatDraft = { content: "", images: [], mentions: [] }

export const chatStore = new Store<ChatState>({ drafts: {}, runs: {}, statuses: {}, queued: {} })

export function resetChatConnection() {
  chatStore.setState((state) => ({ ...state, runs: {}, statuses: {}, queued: {} }))
}

export function setChatQueue(botId: string, queued: QueuedMessage[]) {
  chatStore.setState((state) => ({ ...state, queued: { ...state.queued, [botId]: queued.length > 0 ? queued : undefined } }))
}

export function setChatDraftContent(botId: string, content: string) {
  updateDraft(botId, (draft) => ({ ...draft, content }))
}

export function setChatDraftCommand(botId: string, command: ChatCommandName | undefined, content: string) {
  updateDraft(botId, (draft) => ({ images: draft.images, mentions: draft.mentions, content, ...(command ? { command } : {}) }))
}

export function addChatDraftMention(botId: string, content: string, mention: ChatMention) {
  updateDraft(botId, (draft) => ({ ...draft, content, mentions: [...draft.mentions.filter((known) => known.botId !== mention.botId), mention] }))
}

export function addChatDraftImages(botId: string, images: ChatDraft["images"]) {
  updateDraft(botId, (draft) => ({ ...draft, images: [...draft.images, ...images] }))
}

export function removeChatDraftImage(botId: string, index: number) {
  updateDraft(botId, (draft) => ({ ...draft, images: draft.images.filter((_, position) => position !== index) }))
}

export function startChatRun(botId: string, message: IncomingMessage, messageId: string) {
  chatStore.setState((state) => ({
    ...state,
    runs: {
      ...state.runs,
      [botId]: { messageId, message, completedMessages: [], steps: [], permissionRequests: [], pluginRequests: [], pluginSteps: {}, waitingMessage: nextChatWaitingMessage(), compacting: false, status: "running" },
    },
    statuses: { ...state.statuses, [botId]: "working" },
  }))
}

export function setChatDraft(botId: string, draft: ChatDraft) {
  updateDraft(botId, () => draft)
}

export function finishChatMessage(botId: string, message?: ConversationMessage) {
  if (!message) {
    return
  }

  updateRun(botId, (run) => ({ ...run, completedMessages: [...run.completedMessages, message], steps: [] }))
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

export function startChatTool(botId: string, { callId, tool: name, label, detail, brief }: { callId: string; tool: string; label?: string; detail?: string; brief?: string }) {
  updateRun(botId, (run) => {
    const tool = { callId, name, ...(label ? { label } : {}), ...(detail ? { detail } : {}), ...(brief ? { brief } : {}), status: "running" as const }
    const lastStep = run.steps.at(-1)

    if (lastStep?.type === "tool" && lastStep.name === name) {
      return { ...run, steps: [...run.steps.slice(0, -1), { ...lastStep, tools: [...lastStep.tools, tool] }] }
    }

    return { ...run, steps: [...run.steps, { type: "tool", name, tools: [tool] }] }
  })
}

function finishedToolStatus(failed: boolean, denied?: boolean) {
  if (denied) {
    return "denied" as const
  }

  if (failed) {
    return "failed" as const
  }

  return "done" as const
}

export function finishChatTool(botId: string, callId: string, failed: boolean, error?: string, denied?: boolean) {
  updateRun(botId, (run) => ({
    ...run,
    steps: run.steps.map((step) => step.type === "tool"
      ? {
          ...step,
          tools: step.tools.map((tool) => tool.callId === callId
            ? { ...tool, status: finishedToolStatus(failed, denied), ...(error ? { error } : {}) }
            : tool),
        }
      : step),
  }))
}

export function setChatCompacting(botId: string, compacting: boolean) {
  updateRun(botId, (run) => ({ ...run, compacting }))
}

export function requestChatPermission(botId: string, request: PermissionRequest) {
  updateRun(botId, (run) => ({ ...run, permissionRequests: [...run.permissionRequests.filter((pending) => pending.id !== request.id), request] }))
  setChatStatus(botId, "awaiting-decision")
}

export function resolveChatPermission(botId: string, requestId: string) {
  const permissionRequests = chatStore.state.runs[botId]?.permissionRequests.filter((request) => request.id !== requestId) ?? []

  updateRun(botId, (run) => ({ ...run, permissionRequests }))
  settleDecision(botId)
}

export function requestChatPlugin(botId: string, request: PluginRequest) {
  updateRun(botId, (run) => ({ ...run, pluginRequests: [...run.pluginRequests.filter((pending) => pending.id !== request.id), request] }))
  setChatStatus(botId, "awaiting-decision")
}

export function setChatPluginStep(botId: string, requestId: string, step: PluginStep) {
  updateRun(botId, (run) => ({ ...run, pluginSteps: { ...run.pluginSteps, [requestId]: step } }))
}

export function resolveChatPlugin(botId: string, requestId: string) {
  updateRun(botId, (run) => {
    const { [requestId]: _resolved, ...pluginSteps } = run.pluginSteps

    return { ...run, pluginRequests: run.pluginRequests.filter((request) => request.id !== requestId), pluginSteps }
  })
  settleDecision(botId)
}

function settleDecision(botId: string) {
  const run = chatStore.state.runs[botId]
  const pending = (run?.permissionRequests.length ?? 0) + (run?.pluginRequests.length ?? 0)

  setChatStatus(botId, pending === 0 ? "working" : "awaiting-decision")
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
  const run = chatStore.state.runs[botId]

  if (!run) {
    return
  }

  const response = run.completedMessages.findLast((message) => message.authorBotId === botId)?.content
  const finalStatus = status === "completed" && run.completedMessages.at(-1)?.question ? "awaiting-response" : status

  chatStore.setState((state) => ({
    ...state,
    runs: { ...state.runs, [botId]: undefined },
    statuses: { ...state.statuses, [botId]: finalStatus },
  }))

  return response
}

function updateDraft(botId: string, update: (draft: ChatDraft) => ChatDraft) {
  chatStore.setState((state) => ({ ...state, drafts: { ...state.drafts, [botId]: update(state.drafts[botId] ?? emptyChatDraft) } }))
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
