import { z } from "zod"
import { id } from "./ids"

const request = z.strictObject({
  id,
  tool: id,
  label: id.optional(),
  arguments: z.record(z.string(), z.unknown()).optional(),
  detail: id.optional(),
  brief: id.optional(),
  cwd: id.optional(),
})

export const permissionSchemas = {
  request,
  decideInput: z.strictObject({ botId: id, requestId: id, decision: z.enum(["allowed", "denied"]) }),
}

export type PermissionRequest = z.infer<typeof request>
export type PermissionDecision = z.infer<typeof permissionSchemas.decideInput>["decision"]
