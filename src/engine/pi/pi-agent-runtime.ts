import type { BotEffort } from "../../shared/bots"
import type { BotPermissionMode } from "../../shared/bot-permissions"
import type { ConversationCompactionResult, MessageImage, TurnContext } from "../../shared/conversations"
import type { PermissionDecision, PermissionRequest } from "../../shared/permissions"
import type { Observability } from "../observability/observability"
import type { PiPermissionPolicy } from "./pi-permissions"

export type PiRuntimeEvent =
  | { type: "started" }
  | { type: "text"; text: string }
  | { type: "thinking-started" }
  | { type: "thinking"; text: string }
  | { type: "thinking-finished" }
  | { type: "tool-started"; callId: string; tool: string; label?: string; detail?: string; brief?: string }
  | { type: "tool-finished"; callId: string; tool: string; failed: boolean; denied?: boolean; error?: string }
  | { type: "permission-requested"; request: PermissionRequest }
  | { type: "permission-resolved"; requestId: string }
  | { type: "finished"; reason: "stop" | "aborted" | "error"; error?: string }

export type ToolInputSchema = {
  type: "object"
  properties: Record<string, unknown>
  required?: string[]
  additionalProperties?: boolean
}

export type PiCustomTool = {
  name: string
  description: string
  label?: string
  parameters: Record<string, string>
  execute(params: Record<string, string>, signal?: AbortSignal): Promise<string>
}

export type PiSchemaTool = {
  name: string
  description: string
  label?: string
  inputSchema: ToolInputSchema
  execute(params: Record<string, unknown>, signal?: AbortSignal): Promise<string>
}

export type PiTool = PiCustomTool | PiSchemaTool

export type PiPrompt = {
  content: string
  images?: MessageImage[]
  context?: TurnContext
}

export type PiSession = {
  sessionFile?: string
  compact(customInstructions?: string): Promise<ConversationCompactionResult>
  prompt(input: PiPrompt): Promise<void>
  abort(): Promise<void>
  addTools?(tools: PiTool[]): void
  subscribe(listener: (event: PiRuntimeEvent) => void): () => void
  dispose(): void
}

export function toolLabels(tools: PiTool[]) {
  return Object.fromEntries(tools.flatMap((tool) => tool.label ? [[tool.name, tool.label]] : []))
}

export type PiSessionFactory = {
  open(input: {
    botId: string
    cwd: string
    tools: string[]
    effort: BotEffort
    model: string | null
    policy: PiPermissionPolicy
    customTools?: PiTool[]
    sessionFile?: string
    instructions?: string
    ephemeral?: boolean
  }): Promise<PiSession>
}

export function deferPiSessionFactory(load: () => Promise<PiSessionFactory>): PiSessionFactory & { warm(): Promise<PiSessionFactory> } {
  let loading: Promise<PiSessionFactory> | undefined

  function warm() {
    loading ??= load()

    return loading
  }

  return {
    warm,
    async open(input) {
      const factory = await warm()

      return factory.open(input)
    },
  }
}

export function createPiAgentRuntime(sessionFactory: PiSessionFactory, observability: Observability) {
  const sessions = new Map<string, { session: PiSession; policy: PiPermissionPolicy; unsubscribe: () => void; listeners: Set<(event: PiRuntimeEvent) => void> }>()
  const pending = new Map<string, { botId: string; request: PermissionRequest; resolve(decision: PermissionDecision): void }>()
  const denied = new Set<string>()

  function pendingKey(botId: string, requestId: string) {
    return `${botId}:${requestId}`
  }

  function annotate(botId: string, policy: PiPermissionPolicy, event: PiRuntimeEvent): PiRuntimeEvent {
    if (event.type === "tool-started") {
      const label = policy.labels?.[event.tool]

      return label ? { ...event, label } : event
    }

    if (event.type === "tool-finished" && denied.delete(pendingKey(botId, event.callId))) {
      return { ...event, denied: true }
    }

    return event
  }

  function deliver(botId: string, event: PiRuntimeEvent) {
    for (const listener of sessions.get(botId)?.listeners ?? []) {
      listener(event)
    }
  }

  function denyPending(botId: string) {
    for (const [key, request] of pending) {
      if (request.botId === botId) {
        pending.delete(key)
        denied.add(key)
        request.resolve("denied")
      }
    }
  }

  function close(botId: string) {
    const entry = sessions.get(botId)

    if (!entry) {
      return
    }

    denyPending(botId)
    entry.unsubscribe()
    entry.session.dispose()
    sessions.delete(botId)
  }

  return {
    async open(input: { botId: string; cwd: string; tools: string[]; effort: BotEffort; model: string | null; permissionMode: BotPermissionMode; customTools?: PiTool[]; sessionFile?: string; instructions?: string }) {
      close(input.botId)
      const policy: PiPermissionPolicy = {
        botId: input.botId,
        allowedRoot: input.cwd,
        mode: input.permissionMode,
        labels: toolLabels(input.customTools ?? []),
        request: (request) => new Promise<PermissionDecision>((resolve) => {
          const key = pendingKey(input.botId, request.id)

          if (pending.has(key)) {
            throw new Error("Permission request already exists")
          }

          pending.set(key, { botId: input.botId, request, resolve })
          deliver(input.botId, { type: "permission-requested", request })
        }),
      }
      const session = await observability.span({ name: "pi.sessionopen", context: { botId: input.botId, provider: "codex" } }, () => sessionFactory.open({ ...input, policy }))
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
          listener(annotate(input.botId, policy, event))
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
    async prompt(botId: string, prompt: PiPrompt) {
      const entry = sessions.get(botId)

      if (!entry) {
        throw new Error("Pi session not found")
      }

      return observability.span({ name: "pi.turn", context: { botId, provider: "codex" } }, () => entry.session.prompt(prompt))
    },
    async compact(botId: string, customInstructions?: string) {
      const entry = sessions.get(botId)

      if (!entry) {
        throw new Error("Pi session not found")
      }

      return observability.span({ name: "pi.compact", context: { botId, provider: "codex" } }, () => entry.session.compact(customInstructions))
    },
    addTools(botId: string, tools: PiTool[]) {
      const entry = sessions.get(botId)

      if (!entry) {
        throw new Error("Pi session not found")
      }

      if (!entry.session.addTools) {
        throw new Error("Pi session cannot add tools")
      }

      entry.policy.labels = { ...entry.policy.labels, ...toolLabels(tools) }
      entry.session.addTools(tools)
    },
    async abort(botId: string) {
      const entry = sessions.get(botId)

      if (!entry) {
        throw new Error("Pi session not found")
      }

      denyPending(botId)

      return observability.span({ name: "pi.abort", context: { botId, provider: "codex" } }, () => entry.session.abort())
    },
    resolvePermission({ botId, requestId, decision }: { botId: string; requestId: string; decision: PermissionDecision }) {
      const key = pendingKey(botId, requestId)
      const request = pending.get(key)

      if (!request || request.botId !== botId) {
        throw new Error("Permission request not found")
      }

      pending.delete(key)

      if (decision === "denied") {
        denied.add(key)
      }

      request.resolve(decision)
      deliver(botId, { type: "permission-resolved", requestId })
    },
    pending(botId: string) {
      return Array.from(pending.values()).filter((request) => request.botId === botId).map((request) => request.request)
    },
    close,
    dispose() {
      for (const botId of sessions.keys()) {
        close(botId)
      }
    },
  }
}
