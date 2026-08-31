import type { Observability } from "../observability/observability"
import type { PiPermissionDecision, PiPermissionPolicy } from "./pi-permissions"

export type PiRuntimeEvent =
  | { type: "started" }
  | { type: "text"; text: string }
  | { type: "tool-started"; tool: string }
  | { type: "tool-finished"; tool: string; failed: boolean }
  | { type: "finished"; reason: "stop" | "aborted" | "error" }

export type PiSession = {
  sessionFile?: string
  prompt(message: string): Promise<void>
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
    policy: PiPermissionPolicy
    decisions: PiPermissionDecision[]
    sessionFile?: string
    instructions?: string
  }): Promise<PiSession>
}

export function createPiAgentRuntime(sessionFactory: PiSessionFactory, observability: Observability) {
  const sessions = new Map<string, { session: PiSession; policy: PiPermissionPolicy; unsubscribe: () => void; listeners: Set<(event: PiRuntimeEvent) => void> }>()
  const decisions: PiPermissionDecision[] = []

  return {
    async open(input: { botId: string; cwd: string; tools: string[]; grants: Set<string>; sessionFile?: string; instructions?: string }) {
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
    async prompt(botId: string, message: string) {
      const entry = sessions.get(botId)

      if (!entry) {
        throw new Error("Pi session not found")
      }

      return observability.span({ name: "pi.turn", context: { botId, provider: "codex" } }, () => entry.session.prompt(message))
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
    dispose() {
      for (const entry of sessions.values()) {
        entry.unsubscribe()
        entry.session.dispose()
      }

      sessions.clear()
    },
  }
}
