import type { PluginKind } from "@src/shared/plugin-kinds"
import type { ToolDescriptor } from "@src/shared/plugins"
import type { PluginAdapter, PluginConnected } from "@src/engine/plugins/plugin-adapter"

type Pending = { resolve(connected: PluginConnected): void; reject(error: Error): void }

export function fakePluginAdapter(kind: PluginKind, options: { available?: boolean; tools?: ToolDescriptor[] } = {}) {
  const pending: Pending[] = []
  const calls: { accountId: string; secret: string; tool: string; input: Record<string, unknown> }[] = []
  const stopped: string[] = []
  const tools = options.tools ?? [{ name: `${kind}_echo`, label: "Echo", description: "Echoes the input", inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] } }]
  let respond: (call: (typeof calls)[number]) => Promise<string> | string = (call) => `${call.tool}:${JSON.stringify(call.input)}`

  const adapter: PluginAdapter = {
    kind,
    availability() {
      return options.available === false ? { available: false, reason: `${kind} is not configured` } : { available: true }
    },
    tools() {
      return tools
    },
    connect() {
      let entry: Pending | undefined
      const connected = new Promise<PluginConnected>((resolve, reject) => {
        entry = { resolve, reject }
        pending.push(entry)
      })

      return {
        authorizationUrl: `https://example.test/authorize/${kind}`,
        connected,
        cancel() {
          entry?.reject(new Error("Connection cancelled"))
        },
      }
    },
    async execute(account, tool, input) {
      const call = { accountId: account.id, secret: account.secret, tool: tool.name, input }
      calls.push(call)

      return respond(call)
    },
    async stop(accountId) {
      stopped.push(accountId)
    },
  }

  return {
    adapter,
    calls,
    stopped,
    tools,
    finish(label: string, secret = `${label}-secret`) {
      const entry = pending.shift()

      if (!entry) {
        throw new Error("No pending connection")
      }

      entry.resolve({ label, secret, tools })
    },
    fail(message: string) {
      pending.shift()?.reject(new Error(message))
    },
    respondWith(next: typeof respond) {
      respond = next
    },
    get pendingCount() {
      return pending.length
    },
  }
}
