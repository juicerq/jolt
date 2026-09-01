import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  type AgentSessionEvent,
} from "@earendil-works/pi-coding-agent"
import { createPermissionExtension } from "./pi-permissions"
import type { PiRuntimeEvent, PiSessionFactory } from "./pi-agent-runtime"

function createEventNormalizer() {
  let lastReason: "stop" | "aborted" | "error" = "error"

  return (event: AgentSessionEvent): PiRuntimeEvent | undefined => {
    if (event.type === "agent_start") {
      lastReason = "error"

      return { type: "started" }
    }

    if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
      return { type: "text", text: event.assistantMessageEvent.delta }
    }

    if (event.type === "message_update" && event.assistantMessageEvent.type === "thinking_start") {
      return { type: "thinking-started" }
    }

    if (event.type === "message_update" && event.assistantMessageEvent.type === "thinking_delta") {
      return { type: "thinking", text: event.assistantMessageEvent.delta }
    }

    if (event.type === "message_update" && event.assistantMessageEvent.type === "thinking_end") {
      return { type: "thinking-finished" }
    }

    if (event.type === "tool_execution_start") {
      const detail = summarizeToolInput(event.toolName, event.args)

      return { type: "tool-started", callId: event.toolCallId, tool: event.toolName, ...(detail ? { detail } : {}) }
    }

    if (event.type === "tool_execution_end") {
      return { type: "tool-finished", callId: event.toolCallId, tool: event.toolName, failed: event.isError }
    }

    if (event.type === "message_end" && event.message.role === "assistant") {
      const reason = event.message.stopReason

      lastReason = reason === "stop" || reason === "aborted" ? reason : "error"
    }

    if (event.type === "agent_settled") {
      return { type: "finished", reason: lastReason }
    }

    return undefined
  }
}

function summarizeToolInput(tool: string, input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return undefined
  }

  const values = input as Record<string, unknown>
  const field = tool === "bash" ? "command" : tool === "grep" || tool === "find" ? "pattern" : "path"
  const value = values[field]

  if (typeof value !== "string") {
    return undefined
  }

  const summary = value.replace(/\s+/g, " ").trim()

  if (!summary) {
    return undefined
  }

  return summary.length > 160 ? `${summary.slice(0, 157)}...` : summary
}

export function createPiSessionFactory(options: { agentDirectory: string; sessionsDirectory: string; modelId: string }): PiSessionFactory {
  let resources: Promise<{ modelRuntime: ModelRuntime; model: Awaited<ReturnType<ModelRuntime["getAvailable"]>>[number] }> | undefined

  async function loadResources() {
    const modelRuntime = await ModelRuntime.create({ signal: AbortSignal.timeout(15_000) })
    const models = await modelRuntime.getAvailable("openai-codex")
    const model = models.find((candidate) => candidate.id === options.modelId)

    if (!model) {
      throw new Error("Pi did not find the configured Codex model")
    }

    return { modelRuntime, model }
  }

  return {
    async open(input) {
      resources ??= loadResources()
      const { modelRuntime, model } = await resources
      const loader = new DefaultResourceLoader({
        cwd: input.cwd,
        agentDir: options.agentDirectory,
        extensionFactories: [createPermissionExtension(input.policy, input.decisions)],
        noSkills: true,
        noPromptTemplates: true,
        noThemes: true,
        noContextFiles: true,
        ...(input.instructions ? { appendSystemPrompt: [input.instructions] } : {}),
      })
      await loader.reload()
      const sessionManager = input.sessionFile
        ? SessionManager.open(input.sessionFile, options.sessionsDirectory, input.cwd)
        : SessionManager.create(input.cwd, options.sessionsDirectory)
      const result = await createAgentSession({ cwd: input.cwd, model, modelRuntime, resourceLoader: loader, sessionManager, tools: input.tools })
      const normalizeEvent = createEventNormalizer()

      return {
        sessionFile: result.session.sessionFile,
        prompt: (message) => result.session.prompt(message),
        abort: () => result.session.abort(),
        setTools: (tools) => result.session.setActiveToolsByName(tools),
        subscribe(listener) {
          return result.session.subscribe((event) => {
            const normalized = normalizeEvent(event)

            if (normalized) {
              listener(normalized)
            }
          })
        },
        dispose: () => result.session.dispose(),
      }
    },
  }
}
