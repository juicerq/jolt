import { Type } from "@earendil-works/pi-ai"
import {
  createAgentSession,
  DefaultResourceLoader,
  defineTool,
  ModelRuntime,
  SessionManager,
  type AgentSessionEvent,
} from "@earendil-works/pi-coding-agent"
import { existsSync } from "node:fs"
import { basename, join } from "node:path"
import { createPermissionExtension } from "./pi-permissions"
import type { PiCustomTool, PiRuntimeEvent, PiSessionFactory } from "./pi-agent-runtime"

const detailFields: Record<string, string> = { bash: "command", grep: "pattern", find: "pattern", delegate: "member", transfer: "member", hire: "name" }
const briefFields: Record<string, string> = { delegate: "outcome", hire: "outcome", transfer: "instructions", routine: "content" }

export function toPiTool(tool: PiCustomTool) {
  return defineTool({
    name: tool.name,
    label: tool.name,
    description: tool.description,
    parameters: Type.Object(Object.fromEntries(Object.entries(tool.parameters).map(([name, description]) => name.endsWith("?")
      ? [name.slice(0, -1), Type.Optional(Type.String({ description }))]
      : [name, Type.String({ description })]))),
    async execute(_toolCallId, params) {
      const text = await tool.execute(params)

      return { content: [{ type: "text", text }], details: {} }
    },
  })
}

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
      const detail = summarizeToolInput(event.args, detailFields[event.toolName] ?? "path")
      const brief = summarizeToolInput(event.args, briefFields[event.toolName])

      return { type: "tool-started", callId: event.toolCallId, tool: event.toolName, ...(detail ? { detail } : {}), ...(brief ? { brief } : {}) }
    }

    if (event.type === "tool_execution_end") {
      const error = event.isError ? summarizeToolError(event.result) : undefined

      return { type: "tool-finished", callId: event.toolCallId, tool: event.toolName, failed: event.isError, ...(error ? { error } : {}) }
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

function summarizeToolInput(input: unknown, field?: string) {
  if (!field || !input || typeof input !== "object" || Array.isArray(input)) {
    return undefined
  }

  const values = input as Record<string, unknown>
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

function summarizeToolError(result: unknown) {
  const content = result && typeof result === "object" && "content" in result && Array.isArray(result.content) ? result.content : []
  const text = content.find((block): block is { type: "text"; text: string } => !!block && typeof block === "object" && block.type === "text" && typeof block.text === "string")
  const summary = text?.text.split(/\n\s*\n/, 1)[0]?.trim() ?? ""

  if (!summary) {
    return undefined
  }

  return summary.length > 300 ? `${summary.slice(0, 297)}...` : summary
}

function openSessionManager(sessionsDirectory: string, cwd: string, sessionFile?: string) {
  if (!sessionFile) {
    return SessionManager.create(cwd, sessionsDirectory)
  }

  const sessionPath = join(sessionsDirectory, basename(sessionFile))
  const sessionExists = existsSync(sessionPath)

  if (!sessionExists) {
    return SessionManager.create(cwd, sessionsDirectory)
  }

  return SessionManager.open(sessionPath, sessionsDirectory, cwd)
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
      const sessionManager = openSessionManager(options.sessionsDirectory, input.cwd, input.sessionFile)
      const result = await createAgentSession({
        cwd: input.cwd,
        model,
        modelRuntime,
        resourceLoader: loader,
        sessionManager,
        tools: input.tools,
        customTools: (input.customTools ?? []).map(toPiTool),
      })
      const normalizeEvent = createEventNormalizer()

      return {
        sessionFile: result.session.sessionFile ? basename(result.session.sessionFile) : undefined,
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
