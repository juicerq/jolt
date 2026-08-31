import { realpath } from "node:fs/promises"
import { isAbsolute, relative, resolve, sep } from "node:path"
import type { ExtensionAPI, InlineExtension } from "@earendil-works/pi-coding-agent"

export type PiPermissionPolicy = {
  botId: string
  allowedRoot: string
  grants: Set<string>
}

export type PiPermissionDecision = {
  botId: string
  tool: string
  decision: "allowed" | "denied"
  reason?: "missing_permission" | "path_outside_root"
  durationMs?: number
  failed?: boolean
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

export async function authorizeToolCall(policy: PiPermissionPolicy, tool: string, input: unknown) {
  if (!policy.grants.has(tool)) {
    return { allowed: false as const, reason: "missing_permission" as const }
  }

  const path = typeof input === "object" && input !== null ? Reflect.get(input, "path") : undefined

  if (path !== undefined && !(await pathIsInside(policy.allowedRoot, path))) {
    return { allowed: false as const, reason: "path_outside_root" as const }
  }

  return { allowed: true as const }
}

export function createPermissionExtension(policy: PiPermissionPolicy, decisions: PiPermissionDecision[]): InlineExtension {
  return {
    name: `permissions-${policy.botId}`,
    factory(pi: ExtensionAPI) {
      const startedAt = new Map<string, number>()

      pi.on("tool_call", async (event) => {
        const authorization = await authorizeToolCall(policy, event.toolName, event.input)

        if (!authorization.allowed) {
          decisions.push({ botId: policy.botId, tool: event.toolName, decision: "denied", reason: authorization.reason })

          return { block: true, reason: authorization.reason === "missing_permission" ? "Tool permission denied" : "Path is outside the allowed working directory" }
        }

        startedAt.set(event.toolCallId, performance.now())
      })
      pi.on("tool_execution_end", (event) => {
        const start = startedAt.get(event.toolCallId)

        if (start === undefined) {
          return
        }

        decisions.push({
          botId: policy.botId,
          tool: event.toolName,
          decision: "allowed",
          durationMs: Math.round(performance.now() - start),
          failed: event.isError,
        })
        startedAt.delete(event.toolCallId)
      })
    },
  }
}
