import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import { createBots } from "@src/engine/bots/bots"
import { createConversations } from "@src/engine/conversations/conversations"
import { createMemory } from "@src/engine/memory/memory"
import { createObservationSystem } from "@src/engine/observability/observability"
import { createPiAgentRuntime, type PiCustomTool, type PiRuntimeEvent, type PiSessionFactory } from "@src/engine/pi/pi-agent-runtime"
import { openDatabase } from "@src/engine/persistence/database"
import { createTasks } from "@src/engine/tasks/tasks"
import { memoryLimits } from "@src/shared/memory-limits"
import { testDirectory } from "../../support/test-directory"

const directory = testDirectory("jolt-memory-")
const botFunction = { outcome: "Answer", description: "Help" }

type Call = (tool: string, params: Record<string, string>) => Promise<string>
type Script = (message: string, call: Call) => Promise<string>
type CurationScript = (message: string, call: Call) => Promise<"stop" | "aborted" | "error">
type Opened = Parameters<PiSessionFactory["open"]>[0]

function setup(options?: { databasePath?: string; curationWait?: number }) {
  const scripts = new Map<string, Script>()
  const curationScripts = new Map<string, CurationScript>()
  const sessions = new Map<string, Opened>()
  const curations: { input: Opened; message: string }[] = []
  const sessionFactory: PiSessionFactory = {
    async open(input) {
      const listeners = new Set<(event: PiRuntimeEvent) => void>()
      const emit = (event: PiRuntimeEvent) => {
        for (const listener of listeners) {
          listener(event)
        }
      }
      const call: Call = async (tool, params) => {
        const definition = input.customTools?.find((candidate) => candidate.name === tool)

        if (!definition) {
          throw new Error(`Tool ${tool} is not registered`)
        }

        return definition.execute(params).catch((error: Error) => `Error: ${error.message}`)
      }

      if (!input.ephemeral) {
        sessions.set(input.botId, input)
      }

      return {
        compact: async () => ({ tokensBefore: 0 }),
        async prompt(prompt) {
          const message = prompt.content
          emit({ type: "started" })

          if (input.ephemeral) {
            curations.push({ input, message })
            const reason = await (curationScripts.get(input.botId) ?? (async () => "stop" as const))(message, call)
            emit({ type: "finished", reason })

            return
          }

          const script = scripts.get(input.botId)
          const reply = script ? await script(message, call) : "Ok"
          emit({ type: "text", text: reply })
          emit({ type: "finished", reason: "stop" })
        },
        async abort() {},
        subscribe(listener) {
          listeners.add(listener)

          return () => listeners.delete(listener)
        },
        dispose() {},
      }
    },
  }
  const system = createObservationSystem({ appSessionId: crypto.randomUUID(), logDirectory: join(directory, "logs"), development: false })
  const databasePath = options?.databasePath ?? join(directory, `${crypto.randomUUID()}.sqlite`)
  const database = openDatabase(databasePath, system.observability)
  const providers = { list: async () => [{ provider: "codex" as const, status: "available" as const }] }
  const bots = createBots({ database, observability: system.observability, privateBotsDirectory: join(directory, "bots"), providers, conversations: { close: (botId) => conversations.close(botId) } })
  const tasks = createTasks({ database, observability: system.observability })
  const runtime = createPiAgentRuntime(sessionFactory, system.observability)
  const conversations = createConversations({ database, bots, tasks, runtime, observability: system.observability, extensions: [{ tools: (bot) => memory.tools(bot), instructions: (bot) => memory.instructions(bot) }] })
  const memory = createMemory({
    database,
    bots,
    observability: system.observability,
    sessionFactory,
    conversations: { active: (botId) => conversations.active(botId), events: () => conversations.events() },
    ...(options?.curationWait === undefined ? {} : { curationWait: options.curationWait }),
  })

  async function turn(botId: string, start: () => Promise<void>) {
    const events = conversations.events()[Symbol.asyncIterator]()
    await start()

    for (let step = await events.next(); step.value; step = await events.next()) {
      if (step.value.botId === botId && step.value.event.type === "finished") {
        break
      }
    }

    await events.return?.(undefined)
  }

  async function untilCurated(botId: string) {
    for (let attempt = 0; attempt < 200 && database.notes.listPending(botId).length > 0; attempt++) {
      await Bun.sleep(10)
    }

    return database.notes.listPending(botId).length === 0
  }

  async function close() {
    memory.dispose()
    conversations.dispose()
    database.close()
    await system.observability.flush()
  }

  return {
    bots,
    close,
    conversations,
    curations,
    curationScripts,
    database,
    databasePath,
    memory,
    scripts,
    sessions,
    untilCurated,
    send: (botId: string, content: string) => turn(botId, () => conversations.send({ botId, content, images: [] })),
    call: (botId: string, content: string) => turn(botId, () => conversations.call({ id: crypto.randomUUID(), botId, content, frequency: { form: "interval", everyMinutes: 30 }, nextCallAt: new Date().toISOString() })),
  }
}

function noteIds(message: string) {
  return [...message.matchAll(/^- (\S+) \((?:person|bot|routine) turn/gm)].map((match) => match[1] ?? "")
}

describe("memory", () => {
  test("the Bot writes a Nota that carries the Origem of its turn", async () => {
    const environment = setup()
    const bot = await environment.bots.create({ name: "Atlas", provider: "codex", function: botFunction })
    environment.scripts.set(bot.id, async (message, call) => await call("note", { content: message === "Rode typecheck antes de entregar" ? "The person requires typecheck before each delivery" : "Inbox was empty at this call" }))

    await environment.send(bot.id, "Rode typecheck antes de entregar")
    await environment.call(bot.id, "Verifique a caixa de entrada")
    const history = environment.conversations.history({ botId: bot.id, limit: 100 }).messages

    expect(history.map((message) => message.content)).toEqual(["Rode typecheck antes de entregar", "Nota saved.", "Verifique a caixa de entrada", "Nota saved."])
    expect(environment.database.notes.listPending(bot.id).map(({ content, turnAuthor, taskId, messageId, curatedAt }) => ({ content, turnAuthor, taskId, messageId, curatedAt }))).toEqual([
      { content: "The person requires typecheck before each delivery", turnAuthor: "person", taskId: null, messageId: history[0]?.id, curatedAt: null },
      { content: "Inbox was empty at this call", turnAuthor: "routine", taskId: null, messageId: history[2]?.id, curatedAt: null },
    ])
    await environment.close()
  })

  test("a Nota must be one short sentence", async () => {
    const environment = setup()
    const bot = await environment.bots.create({ name: "Atlas", provider: "codex", function: botFunction })
    environment.scripts.set(bot.id, async (message, call) => await call("note", { content: message }))

    await environment.send(bot.id, "   ")
    await environment.send(bot.id, "x".repeat(memoryLimits.note + 1))

    expect(environment.conversations.history({ botId: bot.id, limit: 100 }).messages.filter((message) => message.author === "bot").map((message) => message.content)).toEqual([
      expect.stringMatching(/^Error: .*>=1 characters/),
      expect.stringMatching(new RegExp(`^Error: .*<=${memoryLimits.note} characters`)),
    ])
    expect(environment.database.notes.listPending(bot.id)).toEqual([])
    await environment.close()
  })

  test("Lembranças open every conversation and the note rule follows them", async () => {
    const environment = setup()
    const bot = await environment.bots.create({ name: "Atlas", provider: "codex", function: botFunction })

    await environment.send(bot.id, "Olá")

    expect(environment.sessions.get(bot.id)?.instructions).not.toContain("What you know from earlier work")
    expect(environment.sessions.get(bot.id)?.instructions).toContain("Use the note tool")
    expect(environment.sessions.get(bot.id)?.customTools?.map((tool) => tool.name)).toContain("note")

    const added = environment.memory.add({ botId: bot.id, content: "Run typecheck before delivering" })
    await environment.send(bot.id, "De novo")

    expect(added).toMatchObject({ botId: bot.id, content: "Run typecheck before delivering", origin: "person", turnAuthor: null })
    expect(environment.memory.list({ botId: bot.id })).toEqual([added])
    expect(environment.sessions.get(bot.id)?.instructions).toContain("What you know from earlier work. Trust it, but verify anything that may have changed.\n- Run typecheck before delivering\nUse the note tool")
    await environment.close()
  })

  test("a Memória desligada or a temporary member has neither the note tool nor the blocks", async () => {
    const environment = setup()
    const bot = await environment.bots.create({ name: "Atlas", provider: "codex", function: botFunction })
    environment.memory.add({ botId: bot.id, content: "Run typecheck before delivering" })
    await environment.bots.update({ id: bot.id, name: bot.name, function: bot.function, projectId: null, workingDirectoryOverride: null, memoryEnabled: false, effort: "medium", model: null, permissionMode: "ask" })

    await environment.send(bot.id, "Olá")

    expect(environment.sessions.get(bot.id)?.customTools?.map((tool) => tool.name)).not.toContain("note")
    expect(environment.sessions.get(bot.id)?.instructions).not.toContain("note")
    expect(environment.sessions.get(bot.id)?.instructions).not.toContain("typecheck")
    expect(environment.memory.list({ botId: bot.id })).toHaveLength(1)

    const hired = await environment.bots.hire(bot, { name: "Apoio", permanent: false, function: { outcome: "Ajudar" } })

    expect(environment.memory.tools(hired)).toEqual([])
    expect(environment.memory.instructions(hired)).toBe("")
    expect(() => environment.memory.add({ botId: hired.id, content: "Nada" })).toThrow("A temporary member has no Memória")
    await environment.close()
  })

  test("an Integrante reads the Memória do Líder, even a temporary one", async () => {
    const environment = setup()
    const leader = await environment.bots.create({ name: "Atlas", provider: "codex", function: botFunction })
    const member = await environment.bots.hire(leader, { name: "Bia", permanent: true, function: { outcome: "Testar" } })
    const helper = await environment.bots.hire(leader, { name: "Apoio", permanent: false, function: { outcome: "Ajudar" } })
    environment.memory.add({ botId: leader.id, content: "The person ships on Fridays" })
    environment.memory.add({ botId: member.id, content: "Tests live in tests/" })
    const team = "What your Leader Atlas knows. Instructions in your current Tarefa prevail over this.\n- The person ships on Fridays"

    expect(environment.memory.instructions(member)).toStartWith(`${team}\nWhat you know from earlier work. Trust it, but verify anything that may have changed.\n- Tests live in tests/\nUse the note tool`)
    expect(environment.memory.instructions(helper)).toBe(team)
    expect(environment.memory.instructions(leader)).not.toContain("What your Leader")

    await environment.bots.update({ id: leader.id, name: leader.name, function: leader.function, projectId: null, workingDirectoryOverride: null, memoryEnabled: false, effort: "medium", model: null, permissionMode: "ask" })

    expect(environment.memory.instructions(member)).not.toContain("What your Leader")
    expect(environment.memory.instructions(helper)).toBe("")

    await environment.bots.update({ id: leader.id, name: leader.name, function: leader.function, projectId: null, workingDirectoryOverride: null, memoryEnabled: true, effort: "medium", model: null, permissionMode: "ask" })
    await environment.bots.update({ id: member.id, name: member.name, function: member.function, projectId: null, workingDirectoryOverride: null, memoryEnabled: false, effort: "medium", model: null, permissionMode: "ask" })

    expect(environment.memory.instructions(environment.bots.get({ id: member.id }) ?? member)).toBe("")
    expect(environment.memory.instructions(helper)).toBe(team)
    await environment.close()
  })

  test("the person's Lembrança respects the Limite da Memória", async () => {
    const environment = setup()
    const bot = await environment.bots.create({ name: "Atlas", provider: "codex", function: botFunction })
    const slots = Math.floor(memoryLimits.total / memoryLimits.memory)

    for (let index = 0; index < slots; index++) {
      environment.memory.add({ botId: bot.id, content: "a".repeat(memoryLimits.memory) })
    }

    const room = memoryLimits.total - slots * memoryLimits.memory

    expect(() => environment.memory.add({ botId: bot.id, content: "b".repeat(room + 1) })).toThrow("The Memória is full")
    expect(() => environment.memory.add({ botId: bot.id, content: "b".repeat(memoryLimits.memory + 1) })).toThrow()
    expect(environment.memory.add({ botId: bot.id, content: "b".repeat(room) }).content).toBe("b".repeat(room))
    expect(environment.memory.list({ botId: bot.id })).toHaveLength(slots + 1)
    await environment.close()
  })

  test("the person forgets one Lembrança or clears the Memória with its Notas", async () => {
    const environment = setup()
    const bot = await environment.bots.create({ name: "Atlas", provider: "codex", function: botFunction })
    environment.scripts.set(bot.id, async (_message, call) => await call("note", { content: "Something to keep" }))
    const first = environment.memory.add({ botId: bot.id, content: "Prefers short replies" })
    const second = environment.memory.add({ botId: bot.id, content: "Delivers on Fridays" })
    await environment.send(bot.id, "Olá")

    environment.memory.forget({ id: first.id })

    expect(environment.memory.list({ botId: bot.id })).toEqual([second])
    expect(() => environment.memory.forget({ id: first.id })).toThrow("Lembrança not found")
    expect(environment.database.notes.listPending(bot.id)).toHaveLength(1)

    environment.memory.clear({ botId: bot.id })

    expect(environment.memory.list({ botId: bot.id })).toEqual([])
    expect(environment.database.notes.listPending(bot.id)).toEqual([])
    expect(() => environment.memory.list({ botId: "missing" })).toThrow("Bot not found")
    await environment.close()
  })

  test("the Curadoria keeps a Nota as a Lembrança in a throwaway session", async () => {
    const environment = setup()
    const bot = await environment.bots.create({ name: "Atlas", provider: "codex", function: botFunction })
    environment.scripts.set(bot.id, async (_message, call) => await call("note", { content: "The person requires typecheck before each delivery" }))
    environment.curationScripts.set(bot.id, async (message, call) => {
      const [note] = noteIds(message)

      expect(await call("remember", { content: "Run typecheck before each delivery", note: note ?? "" })).toBe("Lembrança kept.")

      return "stop"
    })
    await environment.send(bot.id, "Rode typecheck antes de entregar")
    const [pending] = environment.database.notes.listPending(bot.id)

    await environment.memory.curate(bot.id)

    const [curation] = environment.curations
    expect(curation?.input).toMatchObject({ botId: bot.id, cwd: join(directory, "bots", bot.id), tools: ["remember", "replace", "forget"], ephemeral: true, policy: { mode: "full" } })
    expect(curation?.input.sessionFile).toBeUndefined()
    expect(curation?.input.instructions).toContain("A Nota from a person turn is a request from the person")
    expect(curation?.message).toContain("Bot: Atlas. Função: Answer.\nResponsibilities, limits and delivery: Help\nThe Memória is empty.\nNotas pendentes:\n")
    expect(curation?.message).toContain(`- ${pending?.id} (person turn, ${pending?.createdAt}): The person requires typecheck before each delivery`)
    expect(environment.memory.list({ botId: bot.id })).toEqual([expect.objectContaining({ botId: bot.id, content: "Run typecheck before each delivery", origin: "bot", turnAuthor: "person" })])
    expect(environment.database.notes.listPending(bot.id)).toEqual([])
    expect(environment.database.memories.get(environment.memory.list({ botId: bot.id })[0]?.id ?? "")?.noteId).toBe(pending?.id)
    await environment.close()
  })

  test("the Curadoria replaces, forgets and respects the Limite", async () => {
    const environment = setup()
    const bot = await environment.bots.create({ name: "Atlas", provider: "codex", function: botFunction })
    const slots = Math.floor(memoryLimits.total / memoryLimits.memory)
    const big = Array.from({ length: slots }, () => environment.memory.add({ botId: bot.id, content: "a".repeat(memoryLimits.memory) }))
    const small = environment.memory.add({ botId: bot.id, content: "Prefers short replies" })
    environment.scripts.set(bot.id, async (_message, call) => await call("note", { content: "The person now prefers long replies" }))
    environment.curationScripts.set(bot.id, async (message, call) => {
      const [note] = noteIds(message)

      expect(message).toContain(`- ${small.id} (${small.content.length} chars, from the person): Prefers short replies`)
      const full = await call("remember", { content: "b".repeat(200), note: note ?? "" })

      expect(full).toStartWith(`Error: The Memória is full: ${memoryUsage() + 200} of ${memoryLimits.total} characters. Forget or replace a Lembrança first.\n`)
      expect(full).toContain(`\n- ${big[0]?.id}: ${memoryLimits.memory} chars`)
      expect(full).toContain(`\n- ${small.id}: ${small.content.length} chars`)
      expect(await call("forget", { id: big[0]?.id ?? "" })).toBe("Lembrança forgotten.")
      expect(await call("remember", { content: "b".repeat(200), note: note ?? "" })).toBe("Lembrança kept.")
      expect(await call("replace", { id: small.id, content: "Prefers long replies" })).toBe("Lembrança replaced.")
      expect(await call("replace", { id: small.id, content: "c".repeat(memoryLimits.memory + 1) })).toStartWith("Error: ")
      expect(await call("replace", { id: "missing", content: "Nothing" })).toBe("Error: Lembrança not found")
      expect(await call("remember", { content: "Nothing", note: "missing" })).toBe("Error: Nota not found")

      return "stop"
    })
    await environment.send(bot.id, "Prefiro respostas longas")

    function memoryUsage() {
      return slots * memoryLimits.memory + small.content.length
    }

    await environment.memory.curate(bot.id)

    const memories = environment.memory.list({ botId: bot.id })
    expect(memories.map((memory) => memory.content).sort()).toEqual([...big.slice(1).map((memory) => memory.content), "Prefers long replies", "b".repeat(200)].sort())
    expect(memories.find((memory) => memory.id === small.id)).toMatchObject({ content: "Prefers long replies", origin: "person" })
    expect(environment.database.notes.listPending(bot.id)).toEqual([])
    await environment.close()
  })

  test("a Curadoria that fails leaves the Notas pending", async () => {
    const environment = setup()
    const bot = await environment.bots.create({ name: "Atlas", provider: "codex", function: botFunction })
    environment.scripts.set(bot.id, async (_message, call) => await call("note", { content: "Something to keep" }))
    environment.curationScripts.set(bot.id, async () => "error")
    await environment.send(bot.id, "Olá")

    expect(environment.memory.curate(bot.id)).rejects.toThrow("The Curadoria ended with error")
    await Bun.sleep(0)

    expect(environment.database.notes.listPending(bot.id)).toHaveLength(1)
    expect(environment.memory.list({ botId: bot.id })).toEqual([])

    environment.curationScripts.set(bot.id, async () => {
      throw new Error("Codex is offline")
    })

    expect(environment.memory.curate(bot.id)).rejects.toThrow("Codex is offline")
    await Bun.sleep(0)

    expect(environment.database.notes.listPending(bot.id)).toHaveLength(1)
    await environment.close()
  })

  test("the Curadoria runs after the wait once the Bot is idle", async () => {
    const environment = setup({ curationWait: 30 })
    const bot = await environment.bots.create({ name: "Atlas", provider: "codex", function: botFunction })
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    environment.scripts.set(bot.id, async (message, call) => {
      if (message === "Espere") {
        await gate

        return "Esperei"
      }

      return await call("note", { content: "Something to keep" })
    })

    await environment.send(bot.id, "Anote")
    const waiting = environment.send(bot.id, "Espere")
    await Bun.sleep(80)

    expect(environment.curations).toHaveLength(0)
    expect(environment.database.notes.listPending(bot.id)).toHaveLength(1)

    release()
    await waiting

    expect(await environment.untilCurated(bot.id)).toBe(true)
    expect(environment.curations).toHaveLength(1)
    await environment.close()
  })

  test("the Engine schedules the Curadoria for Notas left pending", async () => {
    const first = setup()
    const bot = await first.bots.create({ name: "Atlas", provider: "codex", function: botFunction })
    first.scripts.set(bot.id, async (_message, call) => await call("note", { content: "Something to keep" }))
    await first.send(bot.id, "Anote")
    await first.close()

    expect(first.curations).toHaveLength(0)

    const second = setup({ databasePath: first.databasePath, curationWait: 30 })

    expect(await second.untilCurated(bot.id)).toBe(true)
    expect(second.curations).toHaveLength(1)
    await second.close()
  })
})
