import type { Bot } from "../../shared/bots"
import type { ConversationEvent } from "../../shared/conversations"
import { parse } from "../../shared/parse"
import type { PluginKind } from "../../shared/plugin-kinds"
import { connectPluginTool, pluginSchemas, type PluginAccount, type PluginRequest, type PluginSnapshot, type PluginStep, type StoredAccount, type StoredPlugin, type ToolDescriptor } from "../../shared/plugins"
import type { Observability } from "../observability/observability"
import type { createBots } from "../bots/bots"
import type { AppDatabase } from "../persistence/database"
import type { PiCustomTool, PiSchemaTool, PiTool } from "../pi/pi-agent-runtime"
import { createQueue } from "../queue"
import { PluginAuthError, type PluginAccountSession, type PluginAdapter, type PluginConnected } from "./plugin-adapter"
import type { Secrets } from "./secrets"

interface Catalogued { id: string; kind: PluginKind; name: string; builtIn: boolean; config?: StoredPlugin["config"] }

type Requested = { account: StoredAccount } | { cancelled: true }

interface PendingRequest { botId: string; request: PluginRequest; resolve(outcome: Requested): void; reject(error: Error): void }

type StepStream = ReturnType<typeof createQueue<PluginStep>>

interface PendingConnection { pluginId: string; done: Promise<PluginSnapshot>; streams: Set<StepStream>; latest(): PluginStep | undefined; cancel(): void }

const builtInPlugins: Catalogued[] = [
  { id: "gmail", kind: "gmail", name: "Gmail", builtIn: true },
  { id: "whatsapp", kind: "whatsapp", name: "WhatsApp", builtIn: true },
]

const accountProperty = { type: "string", description: "Label of the Conta to use. Send it whenever you use more than one Conta of this Plugin. When it is not clear which Conta the person means, ask them before you call." } as const

export function createPlugins(input: {
  database: AppDatabase
  bots: Pick<ReturnType<typeof createBots>, "get">
  observability: Observability
  secrets: Secrets
  adapters: Record<PluginKind, PluginAdapter>
  conversations: { notify(botId: string, event: ConversationEvent): void; addTools(botId: string, tools: PiTool[]): void }
}) {
  const requests = new Map<string, PendingRequest>()
  const connections = new Map<string, PendingConnection>()

  function catalogue(): Catalogued[] {
    return [...builtInPlugins, ...input.database.plugins.list().map((plugin): Catalogued => ({ id: plugin.id, kind: "mcp", name: plugin.name, builtIn: false, config: plugin.config }))]
  }

  function pluginOf(pluginId: string) {
    const plugin = catalogue().find((candidate) => candidate.id === pluginId)

    if (!plugin) {
      throw new Error("Plugin not found")
    }

    return plugin
  }

  function accountOf(accountId: string) {
    const account = input.database.accounts.get(accountId)

    if (!account) {
      throw new Error("Conta not found")
    }

    return account
  }

  function toolsOf(account: Pick<StoredAccount, "pluginId" | "tools">) {
    const plugin = catalogue().find((candidate) => candidate.id === account.pluginId)

    return plugin ? input.adapters[plugin.kind].tools?.() ?? account.tools : account.tools
  }

  function sessionFor(account: StoredAccount): PluginAccountSession {
    const plugin = catalogue().find((candidate) => candidate.id === account.pluginId)

    return {
      id: account.id,
      pluginId: account.pluginId,
      label: account.label,
      ...(plugin?.config ? { config: plugin.config } : {}),
      secret: account.secret ? input.secrets.open(account.secret) : "",
      saveSecret(updated: string) {
        input.database.accounts.update(account.id, { secret: input.secrets.seal(updated), checkedAt: new Date().toISOString() })
      },
    }
  }

  function resumeAccount(account: StoredAccount) {
    const plugin = catalogue().find((candidate) => candidate.id === account.pluginId)

    if (!plugin || account.state !== "connected") {
      return
    }

    try {
      input.adapters[plugin.kind].resume?.(sessionFor(account))
    } catch (error) {
      input.observability.event({ name: "plugin.resumefailed", context: { pluginId: plugin.id }, error: error instanceof Error ? error : new Error("Resume failed") })
    }
  }

  function present(account: StoredAccount, accesses = input.database.accesses.list()): PluginAccount {
    return {
      id: account.id,
      pluginId: account.pluginId,
      label: account.label,
      state: account.state,
      tools: toolsOf(account).map((tool) => tool.name),
      botIds: accesses.filter((access) => access.accountId === account.id).map((access) => access.botId),
      checkedAt: account.checkedAt,
    }
  }

  function list(): PluginSnapshot {
    const accounts = input.database.accounts.list()
    const accesses = input.database.accesses.list()

    return parse(pluginSchemas.snapshot, {
      plugins: catalogue().map((plugin) => {
        const availability = input.adapters[plugin.kind].availability()

        return {
          id: plugin.id,
          kind: plugin.kind,
          name: plugin.name,
          builtIn: plugin.builtIn,
          available: availability.available,
          ...(availability.available ? {} : { unavailableReason: availability.reason }),
          ...(plugin.config ? { config: plugin.config } : {}),
          accounts: accounts.filter((account) => account.pluginId === plugin.id).map((account) => present(account, accesses)),
        }
      }),
    })
  }

  function grantedAccounts(bot: Pick<Bot, "id">) {
    return input.database.accesses.listForBot(bot.id).flatMap((access) => {
      const account = input.database.accounts.get(access.accountId)

      return account ? [account] : []
    })
  }

  function grant(botId: string, accountId: string, granted: boolean) {
    if (!input.bots.get({ id: botId })) {
      throw new Error("Bot not found")
    }

    const account = accountOf(accountId)

    if (!granted) {
      input.database.accesses.remove(botId, account.id)

      return
    }

    input.database.accesses.set({ botId, accountId: account.id })
  }

  function accountsFor(bot: Pick<Bot, "id">, plugin: Catalogued) {
    return grantedAccounts(bot).filter((account) => account.pluginId === plugin.id)
  }

  function describe(plugin: Catalogued, account: StoredAccount, granted: StoredAccount[]) {
    const tools = `Tools available now: ${toolsOf(account).map((tool) => tool.name).join(", ")}.`

    if (granted.length > 1) {
      return `Connected ${plugin.name} as ${account.label}. You now use ${granted.length} Contas of ${plugin.name}: ${granted.map((candidate) => candidate.label).join(", ")}. Pass conta on every call, and ask the person which Conta they mean when it is not clear. ${tools}`
    }

    return `Connected ${plugin.name} as ${account.label}. ${tools}`
  }

  function chooseAccount(plugin: Catalogued, accounts: StoredAccount[], requested: unknown) {
    if (accounts.length === 0) {
      throw new Error(`The Conta for ${plugin.name} was disconnected. Ask the person to connect it again.`)
    }

    const labels = accounts.map((account) => account.label).join(", ")

    if (typeof requested !== "string" || !requested.trim()) {
      const only = accounts.length === 1 ? accounts[0] : undefined

      if (!only) {
        throw new Error(`You use ${accounts.length} Contas of ${plugin.name}: ${labels}. Ask the person which one they mean, then call again with conta.`)
      }

      return only
    }

    const chosen = accounts.find((account) => account.label === requested || account.id === requested)

    if (!chosen) {
      throw new Error(`You have no Conta named ${requested} in ${plugin.name}. Yours: ${labels}. Ask the person which one they mean.`)
    }

    return chosen
  }

  function requestKey(botId: string, requestId: string) {
    return `${botId}:${requestId}`
  }

  function settleRequest(key: string, outcome: { value: Requested } | { error: Error }) {
    const pending = requests.get(key)

    if (!pending) {
      return
    }

    requests.delete(key)
    input.conversations.notify(pending.botId, { type: "plugin-resolved", requestId: pending.request.id })

    if ("error" in outcome) {
      pending.reject(outcome.error)

      return
    }

    pending.resolve(outcome.value)
  }

  function ask(bot: Pick<Bot, "id">, plugin: Catalogued, signal?: AbortSignal) {
    const accounts = input.database.accounts.list().filter((account) => account.pluginId === plugin.id)
    const request = parse(pluginSchemas.request, {
      id: crypto.randomUUID(),
      pluginId: plugin.id,
      pluginName: plugin.name,
      accounts: accounts.map((account) => ({ id: account.id, label: account.label, state: account.state })),
      connectable: input.adapters[plugin.kind].availability().available,
    })
    const key = requestKey(bot.id, request.id)

    return new Promise<Requested>((resolve, reject) => {
      requests.set(key, { botId: bot.id, request, resolve, reject })
      signal?.addEventListener("abort", () => settleRequest(key, { value: { cancelled: true } }), { once: true })
      input.conversations.notify(bot.id, { type: "plugin-requested", request })
    })
  }

  async function reauthorize(bot: Pick<Bot, "id">, plugin: Catalogued, account: StoredAccount, signal?: AbortSignal) {
    const outcome = await ask(bot, plugin, signal)

    if ("cancelled" in outcome) {
      throw new Error(`The person did not reconnect ${account.label}. Continue without ${plugin.name}.`)
    }

    return outcome.account
  }

  function toolFor(bot: Pick<Bot, "id">, plugin: Catalogued, descriptor: ToolDescriptor): PiSchemaTool {
    const adapter = input.adapters[plugin.kind]

    async function run(account: StoredAccount, params: Record<string, unknown>, signal: AbortSignal | undefined, retried: boolean): Promise<string> {
      const session = sessionFor(account)

      try {
        return await input.observability.span({ name: "plugin.toolcall", context: { botId: bot.id, pluginId: plugin.id }, attributes: { tool: descriptor.name } }, () => adapter.execute(session, descriptor, params, signal))
      } catch (error) {
        const authFailed = error instanceof PluginAuthError

        if (!authFailed || retried) {
          throw error
        }

        input.database.accounts.update(account.id, { state: "needs-auth", checkedAt: new Date().toISOString() })
        const reconnected = await reauthorize(bot, plugin, account, signal)

        return run(reconnected, params, signal, true)
      }
    }

    return {
      name: descriptor.name,
      label: descriptor.label,
      description: descriptor.description,
      inputSchema: { ...descriptor.inputSchema, properties: { ...descriptor.inputSchema.properties, conta: accountProperty } },
      async execute(params, signal) {
        const { conta: requested, ...rest } = params
        const account = chooseAccount(plugin, accountsFor(bot, plugin), requested)

        if (account.state === "connected") {
          return run(account, rest, signal, false)
        }

        return run(await reauthorize(bot, plugin, account, signal), rest, signal, true)
      },
    }
  }

  function grantedTools(bot: Pick<Bot, "id">) {
    const plugins = catalogue()
    const tools: PiSchemaTool[] = []
    const names = new Set<string>()

    for (const account of grantedAccounts(bot)) {
      const plugin = plugins.find((candidate) => candidate.id === account.pluginId)

      if (!plugin) {
        continue
      }

      for (const descriptor of toolsOf(account)) {
        if (names.has(descriptor.name)) {
          continue
        }

        names.add(descriptor.name)
        tools.push(toolFor(bot, plugin, descriptor))
      }
    }

    return tools
  }

  function connectTool(bot: Pick<Bot, "id">): PiCustomTool {
    return {
      name: connectPluginTool,
      description: "Ask the person to connect a Plugin so you can use its tools. Use it when the person needs something a Plugin does and you have no tools for it yet, or when they want another Conta of a Plugin you already use. The person picks or connects a Conta; the tools become available right after.",
      parameters: { plugin: "Id of the Plugin, as listed in your instructions" },
      async execute(params, signal) {
        const plugin = catalogue().find((candidate) => candidate.id === params.plugin)

        if (!plugin) {
          throw new Error(`Unknown Plugin ${params.plugin ?? ""}. Use one of: ${catalogue().map((candidate) => candidate.id).join(", ")}`)
        }

        const registered = accountsFor(bot, plugin).length > 0
        const outcome = await ask(bot, plugin, signal)

        if ("cancelled" in outcome) {
          return `The person did not connect ${plugin.name}. Continue without it and offer to try again when they want.`
        }

        if (!registered) {
          input.conversations.addTools(bot.id, toolsOf(outcome.account).map((descriptor) => toolFor(bot, plugin, descriptor)))
        }

        return describe(plugin, outcome.account, accountsFor(bot, plugin))
      },
    }
  }

  function connectionFinished(plugin: Catalogued, connected: PluginConnected, target: { accountId?: string; botId?: string; requestId?: string }) {
    const checkedAt = new Date().toISOString()
    const secret = input.secrets.seal(connected.secret)
    const existing = target.accountId ? accountOf(target.accountId) : undefined
    const account = existing
      ? input.database.accounts.update(existing.id, { label: connected.label, state: "connected", secret, tools: connected.tools, checkedAt })
      : input.database.accounts.create({ id: crypto.randomUUID(), pluginId: plugin.id, label: connected.label, state: "connected", secret, tools: connected.tools, checkedAt })

    if (!account) {
      throw new Error("Conta not found")
    }

    resumeAccount(account)

    if (target.botId) {
      grant(target.botId, account.id, true)
    }

    if (target.botId && target.requestId) {
      settleRequest(requestKey(target.botId, target.requestId), { value: { account } })
    }

    input.observability.event({ name: "plugin.connected", context: { pluginId: plugin.id } })

    return account
  }

  function startConnection(plugin: Catalogued, target: { accountId?: string; botId?: string; requestId?: string }, secret?: string) {
    const availability = input.adapters[plugin.kind].availability()

    if (!availability.available) {
      throw new Error(availability.reason)
    }

    const streams = new Set<StepStream>()
    let latest: PluginStep | undefined

    function step(next: PluginStep) {
      latest = next

      for (const stream of streams) {
        stream.push(next)
      }
    }

    const connection = input.adapters[plugin.kind].connect({ pluginId: plugin.id, name: plugin.name, ...(plugin.config ? { config: plugin.config } : {}), ...(secret ? { secret } : {}), step })
    const connectionId = crypto.randomUUID()
    const done = connection.connected.then((connected) => {
      connectionFinished(plugin, connected, target)

      return list()
    }).catch((error: unknown) => {
      const failure = error instanceof Error ? error : new Error("Connection failed")
      input.observability.event({ name: "plugin.connectionfailed", context: { pluginId: plugin.id }, error: failure })

      if (target.botId && target.requestId) {
        settleRequest(requestKey(target.botId, target.requestId), { error: new Error(`Connecting ${plugin.name} failed: ${failure.message}`) })
      }

      throw failure
    }).finally(() => {
      connections.delete(connectionId)

      for (const stream of streams) {
        stream.close()
      }
    })
    done.catch(() => {})
    connections.set(connectionId, { pluginId: plugin.id, done, streams, latest: () => latest, cancel: connection.cancel })

    return { connectionId, done }
  }

  return {
    resume() {
      for (const account of input.database.accounts.list()) {
        resumeAccount(account)
      }
    },
    tools(bot: Pick<Bot, "id" | "temporary">): PiTool[] {
      const granted = grantedTools(bot)

      if (bot.temporary) {
        return granted
      }

      return [connectTool(bot), ...granted]
    },
    instructions(bot: Pick<Bot, "id" | "temporary" | "leaderBotId" | "permissionMode">) {
      if (bot.permissionMode === "read-only") {
        return ""
      }

      const plugins = catalogue()
      const granted = grantedAccounts(bot)
      const using = plugins.flatMap((plugin) => {
        const accounts = granted.filter((account) => account.pluginId === plugin.id)

        if (accounts.length === 0) {
          return []
        }

        const labels = accounts.map((account) => `${account.label}${account.state === "connected" ? "" : " (it needs to authenticate again; its tools will ask the person)"}`).join(", ")

        if (accounts.length === 1) {
          return [`You use ${plugin.name} as ${labels}.`]
        }

        return [`You use ${plugin.name} as ${labels}. Pass conta on every ${plugin.name} call, and ask the person which Conta they mean when it is not clear.`]
      })

      if (bot.temporary) {
        return using.join("\n")
      }

      const available = plugins.filter((plugin) => input.adapters[plugin.kind].availability().available)
      const offer = available.length > 0
        ? `Plugins you can connect with the connect_plugin tool when the person needs them, including another Conta of a Plugin you already use: ${available.map((plugin) => `${plugin.id} (${plugin.name})`).join(", ")}. Do not ask the person to connect anything by hand; call the tool and they decide there.`
        : ""
      const sharing = !bot.leaderBotId && granted.length > 0
        ? `When hiring, pass plugins with the Conta labels the member may use, separated by commas: ${granted.map((account) => account.label).join(", ")}. A member without plugins cannot use them.`
        : ""

      return [...using, offer, sharing].filter(Boolean).join("\n")
    },
    inheritance(leader: Pick<Bot, "id">, references: string | undefined) {
      const wanted = (references ?? "").split(",").map((reference) => reference.trim()).filter(Boolean)
      const granted = grantedAccounts(leader)
      const accounts = wanted.map((reference) => {
        const account = granted.find((candidate) => candidate.label === reference || candidate.id === reference)

        if (!account) {
          throw new Error(`You have no Conta named ${reference}. Yours: ${granted.map((candidate) => candidate.label).join(", ") || "none"}`)
        }

        return account
      })

      return {
        apply(member: Pick<Bot, "id">) {
          for (const account of accounts) {
            input.database.accesses.set({ botId: member.id, accountId: account.id })
          }
        },
      }
    },
    pending(botId: string): ConversationEvent[] {
      return Array.from(requests.values()).filter((pending) => pending.botId === botId).map((pending) => ({ type: "plugin-requested", request: pending.request }))
    },
    list,
    async addCustom(rawInput: unknown) {
      const details = parse(pluginSchemas.addCustomInput, rawInput)
      const plugin: StoredPlugin = { id: crypto.randomUUID(), name: details.name, config: { command: details.command, envNames: Object.keys(details.env) }, createdAt: new Date().toISOString() }
      input.database.plugins.create(plugin)

      try {
        const connection = startConnection({ ...plugin, kind: "mcp", builtIn: false }, {}, JSON.stringify(details.env))

        return await connection.done
      } catch (error) {
        input.database.plugins.remove(plugin.id)

        throw error
      }
    },
    async remove(rawInput: unknown) {
      const { id } = parse(pluginSchemas.idInput, rawInput)
      const plugin = pluginOf(id)

      if (plugin.builtIn) {
        throw new Error("A built-in Plugin cannot be removed")
      }

      for (const account of input.database.accounts.list().filter((candidate) => candidate.pluginId === id)) {
        await input.adapters[plugin.kind].stop(account.id)
      }

      input.database.plugins.remove(id)

      return list()
    },
    connect(rawInput: unknown) {
      const details = parse(pluginSchemas.connectInput, rawInput)
      const plugin = pluginOf(details.pluginId)

      if (details.accountId && accountOf(details.accountId).pluginId !== plugin.id) {
        throw new Error("That Conta belongs to another Plugin")
      }

      if (details.botId && details.requestId && !requests.has(requestKey(details.botId, details.requestId))) {
        throw new Error("Plugin request not found")
      }

      const stored = details.accountId ? accountOf(details.accountId) : undefined
      const { done: _done, ...started } = startConnection(plugin, details, stored?.secret ? input.secrets.open(stored.secret) : undefined)

      return parse(pluginSchemas.connectOutput, started)
    },
    connectionSteps(rawInput: unknown): AsyncIterable<PluginStep> {
      const { connectionId } = parse(pluginSchemas.connectionInput, rawInput)
      const connection = connections.get(connectionId)
      const pending = connection?.latest()
      const queue = createQueue<PluginStep>(pending ? [pending] : [])

      if (!connection) {
        queue.close()
      }

      connection?.streams.add(queue)

      return {
        async *[Symbol.asyncIterator]() {
          try {
            for (let step = await queue.next(); step; step = await queue.next()) {
              yield step
            }
          } finally {
            connection?.streams.delete(queue)
          }
        },
      }
    },
    async awaitConnection(rawInput: unknown) {
      const { connectionId } = parse(pluginSchemas.connectionInput, rawInput)
      const connection = connections.get(connectionId)

      if (!connection) {
        return list()
      }

      return connection.done
    },
    async disconnect(rawInput: unknown) {
      const { accountId } = parse(pluginSchemas.accountInput, rawInput)
      const account = accountOf(accountId)
      const plugin = pluginOf(account.pluginId)

      if (!plugin.builtIn) {
        throw new Error("Remove the Plugin to disconnect it")
      }

      await input.adapters[plugin.kind].stop(account.id)
      input.database.accounts.remove(account.id)

      return list()
    },
    grant(rawInput: unknown) {
      const details = parse(pluginSchemas.grantInput, rawInput)
      grant(details.botId, details.accountId, details.granted)

      return list()
    },
    decide(rawInput: unknown) {
      const details = parse(pluginSchemas.decideInput, rawInput)
      const key = requestKey(details.botId, details.requestId)
      const pending = requests.get(key)

      if (!pending) {
        throw new Error("Plugin request not found")
      }

      if (details.accountId === null) {
        settleRequest(key, { value: { cancelled: true } })

        return
      }

      const account = accountOf(details.accountId)

      if (account.pluginId !== pending.request.pluginId) {
        throw new Error("That Conta belongs to another Plugin")
      }

      grant(details.botId, account.id, true)
      settleRequest(key, { value: { account } })
    },
    async dispose() {
      for (const key of requests.keys()) {
        settleRequest(key, { value: { cancelled: true } })
      }

      for (const connection of connections.values()) {
        connection.cancel()
      }

      for (const account of input.database.accounts.list()) {
        const plugin = catalogue().find((candidate) => candidate.id === account.pluginId)

        if (plugin) {
          await input.adapters[plugin.kind].stop(account.id).catch(() => {})
        }
      }
    },
  }
}
