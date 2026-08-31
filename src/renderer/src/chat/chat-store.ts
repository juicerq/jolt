import { Store } from "@tanstack/react-store"

type ToolActivity = {
  name: string
  status: "running" | "done" | "failed"
}

export type ChatRun = {
  personContent: string
  responseContent: string
  tools: ToolActivity[]
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

export function startChatRun(botId: string, personContent: string) {
  chatStore.setState((state) => ({
    drafts: { ...state.drafts, [botId]: "" },
    runs: {
      ...state.runs,
      [botId]: { personContent, responseContent: "", tools: [], status: "running" },
    },
    statuses: { ...state.statuses, [botId]: "working" },
  }))
}

export function appendChatText(botId: string, text: string) {
  updateRun(botId, (run) => ({ ...run, responseContent: `${run.responseContent}${text}` }))
}

export function restartChatRun(botId: string) {
  updateRun(botId, (run) => ({ personContent: run.personContent, responseContent: "", tools: [], status: "running" }))
  setChatStatus(botId, "working")
}

export function startChatTool(botId: string, name: string) {
  updateRun(botId, (run) => ({ ...run, tools: [...run.tools, { name, status: "running" }] }))
}

export function finishChatTool(botId: string, name: string, failed: boolean) {
  updateRun(botId, (run) => ({
    ...run,
    tools: run.tools.map((tool) => tool.name === name && tool.status === "running"
      ? { ...tool, status: failed ? "failed" : "done" }
      : tool),
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

export function settleChatRun(botId: string, status: "available" | "completed") {
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
