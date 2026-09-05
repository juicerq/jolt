import { z } from "zod"

export const botExecutionProfile = z.enum(["error-analyst", "error-reviewer", "error-leader", "error-fixer", "error-fixer-strong"])
export type BotExecutionProfile = z.infer<typeof botExecutionProfile>

export const botExecutionProfiles = {
  "error-analyst": { model: "gpt-5.6-luna", permissionMode: "read-only" },
  "error-reviewer": { model: "gpt-5.6-sol", permissionMode: "read-only" },
  "error-leader": { model: "gpt-5.6-sol", permissionMode: "full" },
  "error-fixer": { model: "gpt-5.6-sol", permissionMode: "full" },
  "error-fixer-strong": { model: "gpt-6-astra", permissionMode: "full" },
} as const

export function toolsForExecutionProfile(profile: BotExecutionProfile | null, tools: string[]) {
  if (!profile) {
    return tools
  }

  const allowed = profile === "error-leader"
    ? ["error_cases", "error_case_decide", "error_case_reanalyze"]
    : ["read", "grep", "find", "ls", ...(profile.startsWith("error-fixer") ? ["edit", "write", "automation_bash"] : [])]

  return tools.filter((tool) => allowed.includes(tool))
}
