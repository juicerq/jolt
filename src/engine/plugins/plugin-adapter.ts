import type { PluginKind } from "@src/shared/plugin-kinds"
import type { PluginStep, StoredPlugin, ToolDescriptor } from "@src/shared/plugins"

export class PluginAuthError extends Error {}

export interface PluginConnected { label: string; secret: string; tools: ToolDescriptor[] }

export interface PluginConnection {
  connected: Promise<PluginConnected>
  cancel(): void
}

export interface PluginAccountSession {
  id: string
  pluginId: string
  label: string
  config?: StoredPlugin["config"]
  secret: string
  saveSecret(secret: string): void
}

export type PluginAvailability = { available: true } | { available: false; reason: string }

export interface PluginAdapter {
  kind: PluginKind
  availability(): PluginAvailability
  tools?(): ToolDescriptor[]
  connect(input: { pluginId: string; name: string; config?: StoredPlugin["config"]; secret?: string; step(step: PluginStep): void }): PluginConnection
  resume?(account: PluginAccountSession): void
  execute(account: PluginAccountSession, tool: ToolDescriptor, input: Record<string, unknown>, signal?: AbortSignal): Promise<string>
  stop(accountId: string): Promise<void>
}

export function slugify(name: string) {
  const slug = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")

  return slug || "plugin"
}
