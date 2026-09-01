import type { BotEffort } from "../../shared/bots"
import type { IncomingMessage, MessageImage } from "../../shared/conversations"
import type { Observability } from "../observability/observability"
import type { PiPermissionDecision, PiPermissionPolicy } from "./pi-permissions"

export type PiRuntimeEvent =
  | { type: "started" }
  | { type: "text"; text: string }
  | { type: "thinking-started" }
  | { type: "thinking"; text: string }
  | { type: "thinking-finished" }
  | { type: "tool-started"; callId: string; tool: string; detail?: string; brief?: string }
  | { type: "tool-finished"; callId: string; tool: string; failed: boolean; error?: string }
  | { type: "finished"; reason: "stop" | "aborted" | "error" }

export type PiCustomTool = {
  name: string
  description: string
  parameters: Record<string, string>
  execute(params: Record<string, string>): Promise<string>
}

export type PiSession = {
  sessionFile?: string
  prompt(content: string, images?: MessageImage[]): Promise<void>
  abort(): Promise<void>
  setTools(tools: string[]): void
  subscribe(listener: (event: PiRuntimeEvent) => void): () => void
  dispose(): void
}

export type PiSessionFactory = {
  open(input: {
    botId: string
    cwd: string
    tools: string[]
    effort: BotEffort
    model: string | null
    policy: PiPermissionPolicy
    decisions: PiPermissionDecision[]
    customTools?: PiCustomTool[]
    sessionFile?: string
    instructions?: string
    ephemeral?: boolean
  }): Promise<PiSession>
}

export function createPiAgentRuntime(sessionFactory: PiSessionFactory, observability: Observability) {
  const sessions = new Map<string, { session: PiSession; policy: PiPermissionPolicy; unsubscribe: () => void; listeners: Set<(event: PiRuntimeEvent) => void> }>()
  const decisions: PiPermissionDecision[] = []

  return {
    async open(input: { botId: string; cwd: string; tools: string[]; effort: BotEffort; model: string | null; grants: Set<string>; customTools?: PiCustomTool[]; sessionFile?: string; instructions?: string }) {
      sessions.get(input.botId)?.unsubscribe()
      sessions.get(input.botId)?.session.dispose()

      const policy = { botId: input.botId, allowedRoot: input.cwd, grants: input.grants }
      const session = await observability.span({ name: "pi.sessionopen", context: { botId: input.botId, provider: "codex" } }, () => sessionFactory.open({ ...input, policy, decisions }))
      const listeners = new Set<(event: PiRuntimeEvent) => void>()
      let receivedFirstEvent = false
      const unsubscribe = session.subscribe((event) => {
        if (!receivedFirstEvent) {
          receivedFirstEvent = true
          observability.event({ name: "pi.firstevent", context: { botId: input.botId, provider: "codex" } })
        }

        if (event.type === "tool-started" || event.type === "tool-finished") {
          observability.event({ name: "pi.toolevent", attributes: { state: event.type }, context: { botId: input.botId, provider: "codex" } })
        }

        for (const listener of listeners) {
          listener(event)
        }
      })
      sessions.set(input.botId, { session, policy, unsubscribe, listeners })

      return { sessionFile: session.sessionFile }
    },
    subscribe(botId: string, listener: (event: PiRuntimeEvent) => void) {
      const entry = sessions.get(botId)

      if (!entry) {
        throw new Error("Pi session not found")
      }

      entry.listeners.add(listener)

      return () => entry.listeners.delete(listener)
    },
    async prompt(botId: string, message: Pick<IncomingMessage, "content" | "images">) {
      const entry = sessions.get(botId)

      if (!entry) {
        throw new Error("Pi session not found")
      }

      return observability.span({ name: "pi.turn", context: { botId, provider: "codex" } }, () => entry.session.prompt(message.content, message.images))
    },
    async abort(botId: string) {
      const entry = sessions.get(botId)

      if (!entry) {
        throw new Error("Pi session not found")
      }

      return observability.span({ name: "pi.abort", context: { botId, provider: "codex" } }, () => entry.session.abort())
    },
    setTools(botId: string, tools: string[]) {
      const entry = sessions.get(botId)

      if (!entry) {
        throw new Error("Pi session not found")
      }

      entry.policy.grants.clear()

      for (const tool of tools) {
        entry.policy.grants.add(tool)
      }

      entry.session.setTools(tools)
    },
    decisions() {
      return decisions.map((decision) => ({ ...decision }))
    },
    close(botId: string) {
      const entry = sessions.get(botId)

      if (!entry) {
        return
      }

      entry.unsubscribe()
      entry.session.dispose()
      sessions.delete(botId)
    },
    dispose() {
      for (const entry of sessions.values()) {
        entry.unsubscribe()
        entry.session.dispose()
      }

      sessions.clear()
    },
  }
}
