import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import type { ConversationEvent } from "@src/shared/conversations"
import { createBots } from "@src/engine/bots/bots"
import { createConversations } from "@src/engine/conversations/conversations"
import { createObservationSystem } from "@src/engine/observability/observability"
import { openDatabase } from "@src/engine/persistence/database"
import { createPiAgentRuntime, type PiRuntimeEvent, type PiSessionFactory, type PiTool } from "@src/engine/pi/pi-agent-runtime"
import { PluginAuthError } from "@src/engine/plugins/plugin-adapter"
import { createPlugins } from "@src/engine/plugins/plugins"
import { createSecrets } from "@src/engine/plugins/secrets"
import { createTasks } from "@src/engine/tasks/tasks"
import { fakePluginAdapter } from "../../support/fake-plugin-adapter"
import { testDirectory } from "../../support/test-directory"

const directory = testDirectory("jolt-plugins-")
const botFunction = { outcome: "Answer", description: "Help" }

type Call = (tool: string, params: Record<string, string>) => Promise<string>
type Script = (message: string, call: Call) => Promise<string>

function setup(options: { gmailAvailable?: boolean } = {}) {
  const scripts = new Map<string, Script>()
  const sessions = new Map<string, { tools: string[]; customTools: PiTool[]; instructions: string }>()
  const sessionFactory: PiSessionFactory = {
    async open(input) {
      const listeners = new Set<(event: PiRuntimeEvent) => void>()
      const emit = (event: PiRuntimeEvent) => {
        for (const listener of listeners) {
          listener(event)
        }
      }
      const registered = [...(input.customTools ?? [])]
      let controller = new AbortController()
      sessions.set(input.botId, { tools: input.tools, customTools: registered, instructions: input.instructions ?? "" })

      return {
        sessionFile: join(directory, `${input.botId}.jsonl`),
        compact: async () => ({ tokensBefore: 0 }),
        async prompt(prompt) {
          const message = prompt.content
          controller = new AbortController()
          emit({ type: "started" })
          const script = scripts.get(input.botId) ?? scripts.get("*")

          if (!script) {
            emit({ type: "text", text: "ok" })
            emit({ type: "finished", reason: "stop" })

            return
          }

          const reply = await script(message, async (tool, params) => {
            const definition = registered.find((candidate) => candidate.name === tool)

            if (!definition) {
              return `Error: Tool ${tool} is not registered`
            }

            const callId = crypto.randomUUID()
            emit({ type: "tool-started", callId, tool })
            const result = await definition.execute(params, controller.signal).catch((error: Error) => `Error: ${error.message}`)
            emit({ type: "tool-finished", callId, tool, failed: result.startsWith("Error:") })

            return result
          })

          if (controller.signal.aborted) {
            return
          }

          emit({ type: "text", text: reply })
          emit({ type: "finished", reason: "stop" })
        },
        async abort() {
          controller.abort()
          emit({ type: "finished", reason: "aborted" })
        },
        subscribe(listener) {
          listeners.add(listener)

          return () => listeners.delete(listener)
        },
        addTools(tools) {
          registered.push(...tools)
        },
        dispose() {},
      }
    },
  }
  const observationSystem = createObservationSystem({ appSessionId: crypto.randomUUID(), logDirectory: join(directory, "logs"), development: false })
  const database = openDatabase(join(directory, `${crypto.randomUUID()}.sqlite`), observationSystem.observability)
  const providers = { list: async () => [{ provider: "codex" as const, status: "available" as const }] }
  const bots = createBots({ database, observability: observationSystem.observability, privateBotsDirectory: join(directory, "bots"), providers, conversations: { close: (botId) => conversations.close(botId) } })
  const tasks = createTasks({ database, observability: observationSystem.observability })
  const runtime = createPiAgentRuntime(sessionFactory, observationSystem.observability)
  const gmail = fakePluginAdapter("gmail", { available: options.gmailAvailable })
  const mcp = fakePluginAdapter("mcp")
  const conversations = createConversations({
    database,
    bots,
    tasks,
    runtime,
    observability: observationSystem.observability,
    extensions: [{
      tools: (bot) => plugins.tools(bot),
      instructions: (bot) => plugins.instructions(bot),
      pending: (botId) => plugins.pending(botId),
      inheritance: (leader, references) => plugins.inheritance(leader, references),
    }],
  })
  const plugins = createPlugins({
    database,
    bots,
    observability: observationSystem.observability,
    secrets: createSecrets("11".repeat(32)),
    adapters: { gmail: gmail.adapter, whatsapp: fakePluginAdapter("whatsapp").adapter, mcp: mcp.adapter },
    conversations: { notify: (botId, event) => conversations.notify(botId, event), addTools: (botId, tools) => conversations.addTools(botId, tools) },
  })

  function turn(botId: string, content: string) {
    const events = conversations.events()[Symbol.asyncIterator]()
    const collected: ConversationEvent[] = []
    let requested: ((event: Extract<ConversationEvent, { type: "plugin-requested" }>) => void) | undefined
    const request = new Promise<Extract<ConversationEvent, { type: "plugin-requested" }>>((resolve) => {
      requested = resolve
    })
    const finished = (async () => {
      await conversations.send({ botId, content, images: [] })

      for (let step = await events.next(); step.value; step = await events.next()) {
        if (step.value.botId !== botId) {
          continue
        }

        collected.push(step.value.event)

        if (step.value.event.type === "plugin-requested") {
          requested?.(step.value.event)
        }

        if (step.value.event.type === "finished") {
          break
        }
      }

      await events.return?.(undefined)

      return collected
    })()

    return { request, finished, reply: () => collected.filter((event) => event.type === "text").map((event) => event.type === "text" ? event.text : "").join("") }
  }

  async function close() {
    await plugins.dispose()
    conversations.dispose()
    database.close()
    await observationSystem.observability.flush()
  }

  return { bots, database, plugins, gmail, mcp, scripts, sessions, conversations, turn, close }
}

describe("plugins", () => {
  test("the bot connects Gmail from the conversation and uses it in the same turn", async () => {
    const environment = setup()
    const bot = await environment.bots.create({ name: "Atlas", provider: "codex", function: botFunction })
    environment.scripts.set(bot.id, async (_message, call) => {
      const connected = await call("connect_plugin", { plugin: "gmail" })
      const echoed = await call("gmail_echo", { text: "hello" })

      return `${connected} | ${echoed}`
    })

    const turn = environment.turn(bot.id, "Quero conectar meu gmail")
    const requested = await turn.request
    expect(requested.request).toMatchObject({ pluginId: "gmail", pluginName: "Gmail", accounts: [], connectable: true })

    const started = environment.plugins.connect({ pluginId: "gmail", botId: bot.id, requestId: requested.request.id })
    const steps = []

    for await (const step of environment.plugins.connectionSteps({ connectionId: started.connectionId })) {
      steps.push(step)
      break
    }

    expect(steps).toEqual([{ type: "browser", url: "https://example.test/authorize/gmail" }])
    environment.gmail.finish("ana@example.com")
    const snapshot = await environment.plugins.awaitConnection({ connectionId: started.connectionId })
    const events = await turn.finished

    expect(turn.reply()).toBe(`Connected Gmail as ana@example.com. Tools available now: gmail_echo. | gmail_echo:{"text":"hello"}`)
    expect(events.some((event) => event.type === "plugin-resolved" && event.requestId === requested.request.id)).toBe(true)
    expect(snapshot.plugins.find((plugin) => plugin.id === "gmail")?.accounts).toEqual([expect.objectContaining({ label: "ana@example.com", state: "connected", tools: ["gmail_echo"], botIds: [bot.id] })])
    expect(environment.gmail.calls).toEqual([expect.objectContaining({ secret: "ana@example.com-secret", tool: "gmail_echo", input: { text: "hello" } })])
    expect(environment.database.accounts.list()[0]?.secret).not.toContain("ana@example.com-secret")

    await environment.close()
  })

  test("a second bot picks the existing Conta and the tool is ready in its next turn", async () => {
    const environment = setup()
    const first = await environment.bots.create({ name: "Atlas", provider: "codex", function: botFunction })
    const second = await environment.bots.create({ name: "Bia", provider: "codex", function: botFunction })
    const started = environment.plugins.connect({ pluginId: "gmail", botId: first.id })
    environment.gmail.finish("ana@example.com")
    await environment.plugins.awaitConnection({ connectionId: started.connectionId })
    const account = environment.database.accounts.list()[0]
    environment.scripts.set(second.id, async (_message, call) => call("connect_plugin", { plugin: "gmail" }))

    const turn = environment.turn(second.id, "usa o gmail")
    const requested = await turn.request
    expect(requested.request.accounts).toEqual([{ id: account?.id ?? "", label: "ana@example.com", state: "connected" }])
    environment.plugins.decide({ botId: second.id, requestId: requested.request.id, accountId: account?.id ?? "" })
    await turn.finished

    expect(turn.reply()).toContain("Connected Gmail as ana@example.com")
    expect(environment.database.accounts.list()).toHaveLength(1)
    environment.scripts.set(second.id, async (_message, call) => call("gmail_echo", { text: "again" }))
    await environment.turn(second.id, "de novo").finished
    expect(environment.sessions.get(second.id)?.customTools.map((tool) => tool.name)).toContain("gmail_echo")
    expect(environment.sessions.get(second.id)?.instructions).toContain("You use Gmail as ana@example.com")

    await environment.close()
  })

  test("declining the request lets the bot continue without the Plugin", async () => {
    const environment = setup()
    const bot = await environment.bots.create({ name: "Atlas", provider: "codex", function: botFunction })
    environment.scripts.set(bot.id, async (_message, call) => call("connect_plugin", { plugin: "gmail" }))

    const turn = environment.turn(bot.id, "conecta")
    const requested = await turn.request
    environment.plugins.decide({ botId: bot.id, requestId: requested.request.id, accountId: null })
    await turn.finished

    expect(turn.reply()).toContain("The person did not connect Gmail")
    expect(environment.database.accesses.list()).toEqual([])

    await environment.close()
  })

  test("a read-only bot has no plugin tools and an unavailable Plugin is not offered", async () => {
    const environment = setup({ gmailAvailable: false })
    const bot = await environment.bots.create({ name: "Atlas", provider: "codex", function: botFunction })
    await environment.bots.updateExecution({ id: bot.id, setting: "permissionMode", value: "read-only" })
    await environment.turn(bot.id, "oi").finished
    expect(environment.sessions.get(bot.id)?.tools).not.toContain("connect_plugin")

    await environment.bots.updateExecution({ id: bot.id, setting: "permissionMode", value: "full" })
    await environment.turn(bot.id, "oi").finished
    expect(environment.sessions.get(bot.id)?.tools).toContain("connect_plugin")
    expect(environment.sessions.get(bot.id)?.instructions).not.toContain("gmail (Gmail)")
    expect(environment.plugins.list().plugins.find((plugin) => plugin.id === "gmail")).toMatchObject({ available: false, unavailableReason: "gmail is not configured" })

    await environment.close()
  })

  test("a hired member inherits only the Contas the leader names", async () => {
    const environment = setup()
    const leader = await environment.bots.create({ name: "Atlas", provider: "codex", function: botFunction })
    const started = environment.plugins.connect({ pluginId: "gmail", botId: leader.id })
    environment.gmail.finish("ana@example.com")
    await environment.plugins.awaitConnection({ connectionId: started.connectionId })
    const withPlugins = environment.plugins.inheritance(leader, "ana@example.com")
    const without = environment.plugins.inheritance(leader, "")
    const member = environment.database.bots.create({ id: crypto.randomUUID(), avatarSeed: "jolt:new:Calo", leaderBotId: leader.id, projectId: null, name: "Calo", provider: "codex", function: botFunction, workingDirectoryOverride: null, temporary: false, memoryEnabled: false, effort: "medium", model: null, permissionMode: "ask", createdAt: new Date().toISOString() })
    const other = environment.database.bots.create({ id: crypto.randomUUID(), avatarSeed: "jolt:new:Dara", leaderBotId: leader.id, projectId: null, name: "Dara", provider: "codex", function: botFunction, workingDirectoryOverride: null, temporary: true, memoryEnabled: false, effort: "medium", model: null, permissionMode: "ask", createdAt: new Date().toISOString() })

    withPlugins.apply(member)
    without.apply(other)

    expect(environment.database.accesses.listForBot(member.id)).toHaveLength(1)
    expect(environment.database.accesses.listForBot(other.id)).toHaveLength(0)
    expect(() => environment.plugins.inheritance(leader, "bob@example.com")).toThrow("You have no Conta named bob@example.com")
    expect(environment.sessions.get(leader.id)).toBeUndefined()
    await environment.turn(member.id, "oi").finished
    expect(environment.sessions.get(member.id)?.tools).toContain("gmail_echo")
    expect(environment.plugins.tools({ ...member, temporary: true }).map((tool) => tool.name)).toEqual(["gmail_echo"])

    await environment.close()
  })

  test("an expired Conta asks the person to reconnect and the tool call resumes", async () => {
    const environment = setup()
    const bot = await environment.bots.create({ name: "Atlas", provider: "codex", function: botFunction })
    const started = environment.plugins.connect({ pluginId: "gmail", botId: bot.id })
    environment.gmail.finish("ana@example.com")
    await environment.plugins.awaitConnection({ connectionId: started.connectionId })
    const account = environment.database.accounts.list()[0]
    environment.gmail.respondWith((call) => {
      if (call.secret === "ana@example.com-secret") {
        throw new PluginAuthError("token expired")
      }

      return "fresh"
    })
    environment.scripts.set(bot.id, async (_message, call) => call("gmail_echo", { text: "x" }))

    const turn = environment.turn(bot.id, "busca")
    const requested = await turn.request
    expect(requested.request.accounts).toEqual([{ id: account?.id ?? "", label: "ana@example.com", state: "needs-auth" }])
    const reconnect = environment.plugins.connect({ pluginId: "gmail", accountId: account?.id ?? "", botId: bot.id, requestId: requested.request.id })
    environment.gmail.finish("ana@example.com", "renewed-secret")
    await environment.plugins.awaitConnection({ connectionId: reconnect.connectionId })
    await turn.finished

    expect(turn.reply()).toBe("fresh")
    expect(environment.database.accounts.list()).toEqual([expect.objectContaining({ id: account?.id, state: "connected" })])

    await environment.close()
  })

  test("a custom Plugin gets one Conta on add and disappears with its accesses on remove", async () => {
    const environment = setup()
    const bot = await environment.bots.create({ name: "Atlas", provider: "codex", function: botFunction })
    const adding = environment.plugins.addCustom({ name: "Linear", command: "npx linear-mcp", env: { LINEAR_TOKEN: "abc" } })
    environment.mcp.finish("Linear", JSON.stringify({ LINEAR_TOKEN: "abc" }))
    const snapshot = await adding
    const plugin = snapshot.plugins.find((candidate) => candidate.kind === "mcp")
    const account = plugin?.accounts[0]

    expect(plugin).toMatchObject({ name: "Linear", builtIn: false, config: { command: "npx linear-mcp", envNames: ["LINEAR_TOKEN"] } })
    expect(account).toMatchObject({ label: "Linear", state: "connected", tools: ["mcp_echo"] })
    environment.plugins.grant({ botId: bot.id, accountId: account?.id ?? "", granted: true })
    expect(environment.database.accesses.listForBot(bot.id)).toHaveLength(1)
    await expect(environment.plugins.disconnect({ accountId: account?.id ?? "" })).rejects.toThrow("Remove the Plugin")

    const failing = environment.plugins.addCustom({ name: "Broken", command: "nope", env: {} })
    environment.mcp.fail("spawn nope ENOENT")
    await expect(failing).rejects.toThrow("spawn nope ENOENT")
    expect(environment.database.plugins.list()).toHaveLength(1)

    const removed = await environment.plugins.remove({ id: plugin?.id ?? "" })
    expect(removed.plugins.some((candidate) => candidate.kind === "mcp")).toBe(false)
    expect(environment.database.accesses.listForBot(bot.id)).toHaveLength(0)
    expect(environment.mcp.stopped).toEqual([account?.id ?? ""])

    await environment.close()
  })

  test("a bot keeps two Contas of the same Plugin and picks one by label", async () => {
    const environment = setup()
    const bot = await environment.bots.create({ name: "Atlas", provider: "codex", function: botFunction })

    for (const label of ["ana@example.com", "bob@example.com"]) {
      const started = environment.plugins.connect({ pluginId: "gmail", botId: bot.id })
      environment.gmail.finish(label)
      await environment.plugins.awaitConnection({ connectionId: started.connectionId })
    }

    expect(environment.database.accesses.listForBot(bot.id)).toHaveLength(2)

    environment.scripts.set(bot.id, async (_message, call) => {
      const guessed = await call("gmail_echo", { text: "x" })
      const chosen = await call("gmail_echo", { text: "x", conta: "bob@example.com" })
      const unknown = await call("gmail_echo", { text: "x", conta: "carl@example.com" })

      return `${guessed} | ${chosen} | ${unknown}`
    })
    const turn = environment.turn(bot.id, "manda email")
    await turn.finished

    expect(environment.sessions.get(bot.id)?.customTools.filter((tool) => tool.name === "gmail_echo")).toHaveLength(1)
    expect(environment.sessions.get(bot.id)?.instructions).toContain("You use Gmail as ana@example.com, bob@example.com. Pass conta on every Gmail call")
    expect(turn.reply()).toContain("Error: You use 2 Contas of Gmail: ana@example.com, bob@example.com. Ask the person which one they mean")
    expect(turn.reply()).toContain("Error: You have no Conta named carl@example.com in Gmail")
    expect(environment.gmail.calls).toEqual([expect.objectContaining({ secret: "bob@example.com-secret", tool: "gmail_echo", input: { text: "x" } })])

    await environment.close()
  })

  test("a built-in Plugin's tools follow the code, not the snapshot saved with the Conta", async () => {
    const environment = setup()
    const bot = await environment.bots.create({ name: "Atlas", provider: "codex", function: botFunction })
    const started = environment.plugins.connect({ pluginId: "gmail", botId: bot.id })
    environment.gmail.finish("ana@example.com")
    await environment.plugins.awaitConnection({ connectionId: started.connectionId })
    environment.gmail.tools.push({ name: "gmail_labels", label: "Marcadores", description: "Lists labels", inputSchema: { type: "object", properties: {} } })

    expect(environment.plugins.list().plugins.find((plugin) => plugin.id === "gmail")?.accounts[0]?.tools).toEqual(["gmail_echo", "gmail_labels"])

    await environment.close()
  })
})
