import { z } from "zod"
import { parse } from "@src/shared/parse"
import { pluginSchemas, type PluginKind, type PluginStep, type StoredPlugin, type ToolDescriptor } from "@src/shared/plugins"

export class PluginAuthError extends Error {}

export interface PluginConnected { label: string; secret: string; tools: ToolDescriptor[] }

interface PluginConnection {
  connected: Promise<PluginConnected>
  cancel: () => void
}

export interface PluginAccountSession {
  id: string
  pluginId: string
  label: string
  config?: StoredPlugin["config"]
  secret: string
  saveSecret(secret: string): void
}

type PluginAvailability = { available: true } | { available: false; reason: string }

export interface PluginAdapter {
  kind: PluginKind
  availability(): PluginAvailability
  tools?(): ToolDescriptor[]
  accountIdentity?(secret: string): string
  verifyAccess?(account: PluginAccountSession, target: string): Promise<boolean>
  connect(input: { target?: string; pluginId: string; name: string; config?: StoredPlugin["config"]; secret?: string; step: (step: PluginStep) => void }): PluginConnection
  resume?(account: PluginAccountSession): void
  disconnect?(account: PluginAccountSession): Promise<void>
  execute(account: PluginAccountSession, tool: ToolDescriptor, input: Record<string, unknown>, signal?: AbortSignal): Promise<string>
  stop(accountId: string): Promise<void>
}

export function toolInputSchema(schema: z.ZodType) {
  return parse(pluginSchemas.toolDescriptor.shape.inputSchema, z.toJSONSchema(schema, { io: "input" }))
}
