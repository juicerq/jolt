import { z } from "zod"
import { accountStates, pluginKinds } from "./plugin-kinds"

export const connectPluginTool = "connect_plugin"

const id = z.string().min(1)
const pluginKind = z.enum(pluginKinds)
const accountState = z.enum(accountStates)
const mcpConfig = z.strictObject({ command: id, envNames: z.array(id) })
const toolInputSchema = z.looseObject({
  type: z.literal("object"),
  properties: z.record(z.string(), z.unknown()),
  required: z.array(z.string()).optional(),
  additionalProperties: z.boolean().optional(),
})
const toolDescriptor = z.strictObject({ name: id, label: id, description: z.string(), inputSchema: toolInputSchema })
const storedPlugin = z.strictObject({ id, name: id, config: mcpConfig, createdAt: id })
const storedAccount = z.strictObject({
  id,
  pluginId: id,
  label: id,
  state: accountState,
  secret: z.string().nullable(),
  tools: z.array(toolDescriptor),
  checkedAt: id,
})
const step = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("browser"), url: z.url() }),
  z.strictObject({ type: z.literal("qr"), code: id }),
])
const access = z.strictObject({ botId: id, accountId: id })
const account = z.strictObject({
  id,
  pluginId: id,
  label: id,
  state: accountState,
  tools: z.array(id),
  botIds: z.array(id),
  checkedAt: id,
})
const plugin = z.strictObject({
  id,
  kind: pluginKind,
  name: id,
  builtIn: z.boolean(),
  available: z.boolean(),
  unavailableReason: id.optional(),
  config: mcpConfig.optional(),
  accounts: z.array(account),
})
const snapshot = z.strictObject({ plugins: z.array(plugin) })
const request = z.strictObject({
  id,
  pluginId: id,
  pluginName: id,
  accounts: z.array(account.pick({ id: true, label: true, state: true })),
  connectable: z.boolean(),
})

export const pluginSchemas = {
  storedPlugin,
  storedPluginList: z.array(storedPlugin),
  storedAccount,
  storedAccountList: z.array(storedAccount),
  access,
  accessList: z.array(access),
  toolDescriptor,
  toolDescriptorList: z.array(toolDescriptor),
  step,
  snapshot,
  request,
  addCustomInput: z.strictObject({ name: id, command: id, env: z.record(id, z.string()) }),
  idInput: z.strictObject({ id }),
  connectInput: z.strictObject({ pluginId: id, accountId: id.optional(), botId: id.optional(), requestId: id.optional() }),
  connectOutput: z.strictObject({ connectionId: id }),
  connectionInput: z.strictObject({ connectionId: id }),
  accountInput: z.strictObject({ accountId: id }),
  grantInput: z.strictObject({ botId: id, accountId: id, granted: z.boolean() }),
  decideInput: z.strictObject({ botId: id, requestId: id, accountId: id.nullable() }),
}

export type StoredPlugin = z.infer<typeof storedPlugin>
export type StoredAccount = z.infer<typeof storedAccount>
export type PluginAccess = z.infer<typeof access>
export type ToolDescriptor = z.infer<typeof toolDescriptor>
export type PluginStep = z.infer<typeof step>
export type PluginAccount = z.infer<typeof account>
export type Plugin = z.infer<typeof plugin>
export type PluginSnapshot = z.infer<typeof snapshot>
export type PluginRequest = z.infer<typeof request>
export type AddCustomPluginInput = z.infer<typeof pluginSchemas.addCustomInput>
export type PluginConnectInput = z.infer<typeof pluginSchemas.connectInput>
export type PluginGrantInput = z.infer<typeof pluginSchemas.grantInput>
export type PluginDecideInput = z.infer<typeof pluginSchemas.decideInput>
