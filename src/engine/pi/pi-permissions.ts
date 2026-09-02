import { realpath } from "node:fs/promises"
import { isAbsolute, relative, resolve, sep } from "node:path"
import type { ExtensionAPI, InlineExtension } from "@earendil-works/pi-coding-agent"
import type { BotPermissionMode } from "../../shared/bot-permissions"
import type { PermissionDecision, PermissionRequest } from "../../shared/permissions"

type PiPermissionPolicyBase = {
  botId: string
  allowedRoot: string
}

export type PiPermissionPolicy =
  | (PiPermissionPolicyBase & { mode: Extract<BotPermissionMode, "ask">; request(request: PermissionRequest): Promise<PermissionDecision> })
  | (PiPermissionPolicyBase & { mode: Extract<BotPermissionMode, "read-only"> })
  | (PiPermissionPolicyBase & { mode: Extract<BotPermissionMode, "full"> })

const observationTools = new Set(["read", "grep", "find", "ls"])
const detailFields: Record<string, string> = { bash: "command", delegate: "member", hire: "name", note: "content", remove_routine: "id", routine: "content", transfer: "member" }
const briefFields: Record<string, string> = { delegate: "outcome", hire: "outcome", routine: "frequency", transfer: "instructions" }

export function toolsForPermissionMode(mode: BotPermissionMode, tools: string[]) {
  if (mode !== "read-only") {
    return tools
  }

  return tools.filter((tool) => observationTools.has(tool))
}

export async function pathIsInside(root: string, path: unknown) {
  if (typeof path !== "string") {
    return false
  }

  const target = resolve(root, path)
  const lexicalDistance = relative(root, target)
  const lexicallyInside = lexicalDistance !== ".." && !lexicalDistance.startsWith(`..${sep}`) && !isAbsolute(lexicalDistance)

  if (!lexicallyInside) {
    return false
  }

  const canonicalPaths = await Promise.all([realpath(root), realpath(target)]).catch(() => undefined)

  if (!canonicalPaths) {
    return false
  }

  const [canonicalRoot, canonicalTarget] = canonicalPaths
  const canonicalDistance = relative(canonicalRoot, canonicalTarget)

  return canonicalDistance !== ".." && !canonicalDistance.startsWith(`..${sep}`) && !isAbsolute(canonicalDistance)
}

function readDetail(input: unknown, field?: string) {
  if (!field || !input || typeof input !== "object" || Array.isArray(input)) {
    return undefined
  }

  const value = Reflect.get(input, field)

  if (typeof value !== "string") {
    return undefined
  }

  if (!value.trim()) {
    return undefined
  }

  return value
}

export function describeToolCall(id: string, tool: string, input: unknown): PermissionRequest {
  const detail = readDetail(input, detailFields[tool] ?? "path")
  const brief = readDetail(input, briefFields[tool])

  return { id, tool, ...(detail ? { detail } : {}), ...(brief ? { brief } : {}) }
}

export async function authorizeToolCall(policy: PiPermissionPolicy, tool: string, input: unknown, callId: string) {
  if (policy.mode === "full") {
    return { allowed: true as const }
  }

  const observes = observationTools.has(tool)
  const path = observes && typeof input === "object" && input !== null ? Reflect.get(input, "path") ?? "." : undefined
  const inside = observes && await pathIsInside(policy.allowedRoot, path)

  if (inside) {
    return { allowed: true as const }
  }

  if (policy.mode === "read-only") {
    return { allowed: false as const, reason: observes ? "path_outside_root" as const : "missing_permission" as const }
  }

  const decision = await policy.request(describeToolCall(callId, tool, input))

  if (decision === "denied") {
    return { allowed: false as const, reason: "person_denied" as const }
  }

  return { allowed: true as const }
}

export function createPermissionExtension(policy: PiPermissionPolicy): InlineExtension {
  return {
    name: `permissions-${policy.botId}`,
    factory(pi: ExtensionAPI) {
      pi.on("tool_call", async (event) => {
        const authorization = await authorizeToolCall(policy, event.toolName, event.input, event.toolCallId)

        if (!authorization.allowed) {
          const reasons = {
            missing_permission: "This permission mode does not allow the tool",
            path_outside_root: "The path is outside the working directory",
            person_denied: "The person denied this tool call",
          }

          return { block: true, reason: reasons[authorization.reason] }
        }
      })
    },
  }
}
