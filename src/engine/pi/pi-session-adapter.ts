import { Type } from "@earendil-works/pi-ai"
import {
  createAgentSession,
  DefaultResourceLoader,
  defineTool,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type AgentSessionEvent,
  type ExtensionAPI,
  type InlineExtension,
} from "@earendil-works/pi-coding-agent"
import type { TSchema } from "@earendil-works/pi-ai"
import { existsSync } from "node:fs"
import { basename, join } from "node:path"
import { createPermissionExtension } from "./pi-permissions"
import type { PiRuntimeEvent, PiSessionFactory, PiTool } from "./pi-agent-runtime"

const detailFields: Record<string, string> = { bash: "command", grep: "pattern", find: "pattern", delegate: "bot", transfer: "bot", hire: "name", note: "content" }
const briefFields: Record<string, string> = { delegate: "outcome", hire: "outcome", transfer: "instructions", routine: "content" }

function toolSchema(tool: PiTool): TSchema {
  if ("inputSchema" in tool) {
    return tool.inputSchema as TSchema
  }

  return Type.Object(Object.fromEntries(Object.entries(tool.parameters).map(([name, description]) => name.endsWith("?")
    ? [name.slice(0, -1), Type.Optional(Type.String({ description }))]
    : [name, Type.String({ description })])))
}

export function toPiTool(tool: PiTool) {
  return defineTool({
    name: tool.name,
    label: tool.label ?? tool.name,
    description: tool.description,
    parameters: toolSchema(tool),
    async execute(_toolCallId, params, signal) {
      const text = "inputSchema" in tool ? await tool.execute(params as Record<string, unknown>, signal) : await tool.execute(params as Record<string, string>, signal)

      return { content: [{ type: "text", text }], details: {} }
    },
  })
}

function createToolRegistrar(botId: string) {
  let api: ExtensionAPI | undefined
  const extension: InlineExtension = {
    name: `tools-${botId}`,
    factory(pi: ExtensionAPI) {
      api = pi
    },
  }

  return {
    extension,
    add(tools: PiTool[]) {
      if (!api) {
        throw new Error("Pi session is not loaded")
      }

      for (const tool of tools) {
        api.registerTool(toPiTool(tool))
      }

      api.setActiveTools([...new Set([...api.getActiveTools(), ...tools.map((tool) => tool.name)])])
    },
  }
}

export function createEventNormalizer() {
  let lastReason: "stop" | "aborted" | "error" = "error"
  let interrupted = false

  function normalize(event: AgentSessionEvent): PiRuntimeEvent | undefined {
    if (event.type === "agent_start") {
      lastReason = "error"
      interrupted = false

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
      const reason = interrupted && lastReason !== "stop" ? "aborted" : lastReason

      return { type: "finished", reason }
    }

    return undefined
  }

  return {
    normalize,
    abort() {
      interrupted = true
    },
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

function openSessionManager(sessionsDirectory: string, cwd: string, sessionFile?: string, ephemeral?: boolean) {
  if (ephemeral) {
    return SessionManager.inMemory(cwd)
  }

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
  let resources: Promise<{ modelRuntime: ModelRuntime; models: Awaited<ReturnType<ModelRuntime["getAvailable"]>> }> | undefined

  async function loadResources() {
    const modelRuntime = await ModelRuntime.create({ signal: AbortSignal.timeout(15_000) })
    const models = await modelRuntime.getAvailable("openai-codex")

    return { modelRuntime, models }
  }

  return {
    async open(input) {
      resources ??= loadResources()
      const { modelRuntime, models } = await resources
      const modelId = input.model ?? options.modelId
      const model = models.find((candidate) => candidate.id === modelId)

      if (!model) {
        throw new Error(`Pi did not find the Codex model ${modelId}`)
      }

      const registrar = createToolRegistrar(input.botId)
      const loader = new DefaultResourceLoader({
        cwd: input.cwd,
        agentDir: options.agentDirectory,
        extensionFactories: [createPermissionExtension(input.policy), registrar.extension],
        noSkills: true,
        noPromptTemplates: true,
        noThemes: true,
        noContextFiles: true,
        ...(input.instructions ? { systemPrompt: input.instructions } : {}),
      })
      await loader.reload()
      const sessionManager = openSessionManager(options.sessionsDirectory, input.cwd, input.sessionFile, input.ephemeral)
      const result = await createAgentSession({
        cwd: input.cwd,
        model,
        modelRuntime,
        thinkingLevel: input.effort,
        resourceLoader: loader,
        sessionManager,
        settingsManager: SettingsManager.inMemory({ compaction: { keepRecentTokens: 10_000 } }),
        customTools: (input.customTools ?? []).map(toPiTool),
      })
      result.session.setActiveToolsByName(input.tools)
      const normalizer = createEventNormalizer()

      return {
        sessionFile: result.session.sessionFile ? basename(result.session.sessionFile) : undefined,
        async compact(customInstructions) {
          const compacted = await result.session.compact(customInstructions)

          return {
            tokensBefore: compacted.tokensBefore,
            ...(compacted.estimatedTokensAfter === undefined ? {} : { estimatedTokensAfter: compacted.estimatedTokensAfter }),
          }
        },
        async prompt({ content, images = [], context }) {
          if (context) {
            await result.session.sendCustomMessage({ customType: "jolt.turn-context", content: `Jolt context for the next message:\n${JSON.stringify(context)}`, display: false })
          }

          return result.session.prompt(content, { images: images.map((image) => ({ type: "image", ...image })) })
        },
        abort() {
          normalizer.abort()

          return result.session.abort()
        },
        addTools: (tools) => registrar.add(tools),
        subscribe(listener) {
          return result.session.subscribe((event) => {
            const normalized = normalizer.normalize(event)

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
