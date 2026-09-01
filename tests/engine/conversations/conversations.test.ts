import { describe, expect, test } from "bun:test"
import type { ConversationEvent, MessageImage } from "@src/shared/conversations"
import { join } from "node:path"
import { createBots } from "@src/engine/bots/bots"
import { createConversations } from "@src/engine/conversations/conversations"
import { voice } from "@src/engine/conversations/voice"
import { createObservationSystem } from "@src/engine/observability/observability"
import { createPiAgentRuntime, type PiRuntimeEvent, type PiSessionFactory } from "@src/engine/pi/pi-agent-runtime"
import { openDatabase } from "@src/engine/persistence/database"
import { createRoutines } from "@src/engine/routines/routines"
import { createTasks } from "@src/engine/tasks/tasks"
import { testDirectory } from "../../support/test-directory"

const directory = testDirectory("jolt-conversations-")

function setup(databasePath = join(directory, `${crypto.randomUUID()}.sqlite`), completePrompt = true) {
  const prompts: string[] = []
  const promptImages: MessageImage[][] = []
  const efforts: string[] = []
  const instructions: string[] = []
  const sessions = new Map<string, { listeners: Set<(event: PiRuntimeEvent) => void>; aborted: boolean; fail(): void }>()
  const sessionFactory: PiSessionFactory = {
    async open(input) {
      instructions.push(input.instructions ?? "")
      efforts.push(`${input.effort}/${input.model ?? "default"}`)
      let finishPrompt: (() => void) | undefined
      let rejectPrompt: ((error: Error) => void) | undefined
      const state = { listeners: new Set<(event: PiRuntimeEvent) => void>(), aborted: false, fail: () => rejectPrompt?.(new Error("Provider crashed")) }
      sessions.set(input.botId, state)

      return {
        sessionFile: join(directory, `${input.botId}.jsonl`),
        async prompt(message, images = []) {
          prompts.push(message)
          promptImages.push(images)

          for (const listener of state.listeners) {
            listener({ type: "started" })
            listener({ type: "thinking-started" })
            listener({ type: "thinking", text: "Vou verificar o arquivo." })
            listener({ type: "thinking-finished" })
            listener({ type: "tool-started", callId: "read-1", tool: "read", detail: "PROJECT.md" })
            listener({ type: "tool-finished", callId: "read-1", tool: "read", failed: false })
            listener({ type: "tool-started", callId: "read-2", tool: "read", detail: "CONTEXT.md" })
            listener({ type: "tool-finished", callId: "read-2", tool: "read", failed: true, error: "File not found: CONTEXT.md" })
            listener({ type: "thinking-started" })
            listener({ type: "thinking", text: "Agora vou responder." })
            listener({ type: "thinking-finished" })
            listener({ type: "text", text: "Resposta " })

            if (completePrompt) {
              listener({ type: "text", text: "confirmada" })
              listener({ type: "finished", reason: "stop" })
            }
          }

          if (!completePrompt) {
            await new Promise<void>((resolve, reject) => {
              finishPrompt = resolve
              rejectPrompt = reject
            })
          }
        },
        async abort() {
          state.aborted = true

          for (const listener of state.listeners) {
            listener({ type: "finished", reason: "aborted" })
          }

          finishPrompt?.()
        },
        setTools() {},
        subscribe(listener) {
          state.listeners.add(listener)

          return () => state.listeners.delete(listener)
        },
        dispose() {},
      }
    },
  }
  const observationSystem = createObservationSystem({ appSessionId: crypto.randomUUID(), logDirectory: join(directory, "logs"), development: false })
  const database = openDatabase(databasePath, observationSystem.observability)
  const providers = { list: async () => [{ provider: "codex" as const, status: "available" as const }] }
  const bots = createBots({ database, observability: observationSystem.observability, privateBotsDirectory: join(directory, "bots"), providers, conversations: { close: (botId) => conversations.close(botId) } })
  const runtime = createPiAgentRuntime(sessionFactory, observationSystem.observability)
  const tasks = createTasks({ database, observability: observationSystem.observability })
  const conversations = createConversations({ database, bots, tasks, runtime, observability: observationSystem.observability, extensions: [{ tools: (bot) => routines.tools(bot), instructions: (bot) => routines.instructions(bot) }] })
  const routines = createRoutines({ database, bots, observability: observationSystem.observability, conversations: { call: (botId, content) => conversations.call(botId, content) } })

  async function turn(botId: string, content: string, images: MessageImage[] = []) {
    const events = conversations.events()[Symbol.asyncIterator]()
    await conversations.send({ botId, content, images })
    const collected: ConversationEvent[] = []

    for (let step = await events.next(); step.value; step = await events.next()) {
      const { event } = step.value
      const ownStart = event.type === "started" && event.message.content === content
      const skipped = step.value.botId !== botId || (collected.length === 0 && !ownStart)

      if (skipped) {
        continue
      }

      collected.push(event)

      if (step.value.event.type === "finished") {
        break
      }
    }

    await events.return?.(undefined)

    return collected
  }

  async function turnSettled(botId: string) {
    for await (const { botId: eventBotId, event } of conversations.events()) {
      if (eventBotId === botId && event.type === "finished") {
        return
      }
    }
  }

  return { bots, conversations, database, databasePath, efforts, instructions, prompts, promptImages, runtime, sessions, observationSystem, turn, turnSettled }
}

describe("conversations", () => {
  test("streams a Bot response and persists the confirmed history", async () => {
    const first = setup()
    const bot = await first.bots.create({
      name: "Atlas",
      provider: "codex",
      function: { outcome: "Answer", description: "Help" },
    })
    const events = await first.turn(bot.id, "Olá")

    expect(events.map((event) => event.type)).toEqual([
      "started",
      "thinking-started",
      "thinking",
      "thinking-finished",
      "tool-started",
      "tool-finished",
      "tool-started",
      "tool-finished",
      "thinking-started",
      "thinking",
      "thinking-finished",
      "text",
      "text",
      "finished",
    ])
    expect(events.filter((event) => event.type === "thinking-finished").every((event) => event.durationMs > 0)).toBe(true)
    expect(first.prompts).toEqual(["Olá"])
    expect(first.instructions[0]).toStartWith("You are Atlas.\nExpected outcome: Answer\nResponsibilities, limits and delivery: Help\nUse the hire tool")
    expect(first.instructions[0]).toEndWith(voice)
    expect(first.conversations.history({ botId: bot.id }).map(({ author, content }) => ({ author, content }))).toEqual([
      { author: "person", content: "Olá" },
      { author: "bot", content: "Resposta confirmada" },
    ])
    const activity = first.conversations.history({ botId: bot.id }).at(-1)?.activity

    expect(activity?.steps.map((step) => step.type)).toEqual(["thinking", "tool", "thinking"])
    expect(activity?.steps[0]).toMatchObject({ type: "thinking", content: "Vou verificar o arquivo." })
    expect(activity?.steps[1]).toEqual({
      type: "tool",
      name: "read",
      tools: [
        { callId: "read-1", name: "read", detail: "PROJECT.md", status: "done" },
        { callId: "read-2", name: "read", detail: "CONTEXT.md", status: "failed", error: "File not found: CONTEXT.md" },
      ],
    })
    expect(activity?.steps[2]).toMatchObject({ type: "thinking", content: "Agora vou responder." })

    first.conversations.dispose()
    first.database.close()
    const reopened = setup(first.databasePath)

    expect(reopened.conversations.history({ botId: bot.id }).map(({ author, content }) => ({ author, content }))).toEqual([
      { author: "person", content: "Olá" },
      { author: "bot", content: "Resposta confirmada" },
    ])
    expect(reopened.conversations.history({ botId: bot.id }).at(-1)?.activity).toEqual(activity)

    reopened.conversations.dispose()
    reopened.database.close()
    await first.observationSystem.observability.flush()
    await reopened.observationSystem.observability.flush()
  })

  test("aborting the turn keeps the partial response marked as aborted", async () => {
    const environment = setup(join(directory, `${crypto.randomUUID()}.sqlite`), false)
    const bot = await environment.bots.create({
      name: "Atlas",
      provider: "codex",
      function: { outcome: "Answer", description: "Help" },
    })
    await environment.conversations.send({ botId: bot.id, content: "Pare depois", images: [] })
    await environment.conversations.abort({ botId: bot.id })

    expect(environment.sessions.get(bot.id)?.aborted).toBe(true)
    expect(environment.conversations.history({ botId: bot.id }).map(({ author, content, ending }) => ({ author, content, ending }))).toEqual([
      { author: "person", content: "Pare depois", ending: null },
      { author: "bot", content: "Resposta ", ending: "aborted" },
    ])

    environment.conversations.dispose()
    environment.database.close()
    await environment.observationSystem.observability.flush()
  })

  test("excluding a working Bot interrupts its turn before it disappears", async () => {
    const environment = setup(join(directory, `${crypto.randomUUID()}.sqlite`), false)
    const bot = await environment.bots.create({
      name: "Atlas",
      provider: "codex",
      function: { outcome: "Answer", description: "Help" },
    })
    await environment.conversations.send({ botId: bot.id, content: "Pare depois", images: [] })
    const settled = environment.turnSettled(bot.id)

    await environment.bots.remove({ id: bot.id })
    await settled

    expect(environment.sessions.get(bot.id)?.aborted).toBe(true)
    expect(await environment.bots.list()).toEqual([])
    expect(() => environment.conversations.history({ botId: bot.id })).toThrow("Bot not found")
    expect(() => environment.conversations.abort({ botId: bot.id })).toThrow("Bot is not working")

    environment.conversations.dispose()
    environment.database.close()
    await environment.observationSystem.observability.flush()
  })

  test("a turn that fails before answering is recorded as failed", async () => {
    const environment = setup(join(directory, `${crypto.randomUUID()}.sqlite`), false)
    const bot = await environment.bots.create({
      name: "Atlas",
      provider: "codex",
      function: { outcome: "Answer", description: "Help" },
    })
    await environment.conversations.send({ botId: bot.id, content: "Quebre", images: [] })
    environment.sessions.get(bot.id)?.fail()
    await environment.turnSettled(bot.id)

    expect(environment.conversations.history({ botId: bot.id }).at(-1)).toMatchObject({ author: "bot", content: "Resposta ", ending: "failed" })

    environment.conversations.dispose()
    environment.database.close()
    await environment.observationSystem.observability.flush()
  })

  test("a message left unanswered by a previous Engine run is closed on startup", async () => {
    const first = setup()
    const bot = await first.bots.create({
      name: "Atlas",
      provider: "codex",
      function: { outcome: "Answer", description: "Help" },
    })
    first.database.conversations.append({ id: crypto.randomUUID(), botId: bot.id, author: "person", authorBotId: null, taskId: null, content: "Sem resposta", images: [], activity: null, ending: null, createdAt: new Date().toISOString() })
    first.conversations.dispose()
    first.database.close()
    await first.observationSystem.observability.flush()

    const reopened = setup(first.databasePath)

    expect(reopened.conversations.history({ botId: bot.id }).map(({ author, content, ending }) => ({ author, content, ending }))).toEqual([
      { author: "person", content: "Sem resposta", ending: null },
      { author: "bot", content: "", ending: "closed" },
    ])

    const again = setup(first.databasePath)

    expect(again.conversations.history({ botId: bot.id })).toHaveLength(2)

    for (const environment of [reopened, again]) {
      environment.conversations.dispose()
      environment.database.close()
      await environment.observationSystem.observability.flush()
    }
  })

  test("delivers the images a person attaches to the Provider and keeps them in the history", async () => {
    const environment = setup()
    const bot = await environment.bots.create({ name: "Atlas", provider: "codex", function: { outcome: "Answer", description: "Help" } })
    const image = { data: "iVBORw0KGgo=", mimeType: "image/png" as const }

    await environment.turn(bot.id, "", [image])

    expect(environment.prompts).toEqual([""])
    expect(environment.promptImages).toEqual([[image]])
    expect(environment.conversations.history({ botId: bot.id })[0]).toMatchObject({ author: "person", content: "", images: [image] })
    expect(environment.conversations.history({ botId: bot.id })[1]).toMatchObject({ author: "bot", images: [] })
    environment.conversations.dispose()
    await environment.observationSystem.observability.flush()
  })

  test("opens the session with the Bot Esforço and Modelo and reopens it when either changes", async () => {
    const environment = setup()
    const bot = await environment.bots.create({ name: "Atlas", provider: "codex", function: { outcome: "Answer", description: "Help" } })

    await environment.turn(bot.id, "Olá")
    await environment.turn(bot.id, "De novo")
    await environment.bots.update({ id: bot.id, name: bot.name, function: bot.function, projectId: null, workingDirectoryOverride: null, memoryEnabled: true, effort: "high", model: null })
    await environment.turn(bot.id, "Pense mais")
    await environment.bots.update({ id: bot.id, name: bot.name, function: bot.function, projectId: null, workingDirectoryOverride: null, memoryEnabled: true, effort: "high", model: "gpt-5.6-mini" })
    await environment.turn(bot.id, "Mais rápido")

    expect(environment.efforts).toEqual(["medium/default", "high/default", "high/gpt-5.6-mini"])
    environment.conversations.dispose()
    await environment.observationSystem.observability.flush()
  })

  test("rejects a message with neither text nor images", async () => {
    const environment = setup()
    const bot = await environment.bots.create({ name: "Atlas", provider: "codex", function: { outcome: "Answer", description: "Help" } })

    await expect(environment.conversations.send({ botId: bot.id, content: "", images: [] })).rejects.toThrow("Message is empty")
    expect(environment.prompts).toEqual([])
    environment.conversations.dispose()
    await environment.observationSystem.observability.flush()
  })

  test("events carry every turn with its Bot and the incoming message", async () => {
    const environment = setup()
    const bot = await environment.bots.create({
      name: "Atlas",
      provider: "codex",
      function: { outcome: "Answer", description: "Help" },
    })
    const events = environment.conversations.events()[Symbol.asyncIterator]()
    await environment.conversations.send({ botId: bot.id, content: "Olá", images: [] })

    expect((await events.next()).value).toEqual({ botId: bot.id, event: { type: "started", message: { author: "person", authorBotId: null, taskId: null, content: "Olá", images: [] } } })
    const types = []

    for (let step = await events.next(); step.value?.event.type !== "finished"; step = await events.next()) {
      types.push(step.value?.event.type)
    }

    expect(types).toContain("text")
    await events.return?.(undefined)
    environment.conversations.dispose()
    environment.database.close()
    await environment.observationSystem.observability.flush()
  })

  test("a new events subscriber receives the turns already in progress", async () => {
    const environment = setup(join(directory, `${crypto.randomUUID()}.sqlite`), false)
    const bot = await environment.bots.create({
      name: "Atlas",
      provider: "codex",
      function: { outcome: "Answer", description: "Help" },
    })
    await environment.conversations.send({ botId: bot.id, content: "Pare depois", images: [] })

    const events = environment.conversations.events()[Symbol.asyncIterator]()

    expect((await events.next()).value).toEqual({ botId: bot.id, event: { type: "started", message: { author: "person", authorBotId: null, taskId: null, content: "Pare depois", images: [] } } })
    await environment.conversations.abort({ botId: bot.id })
    await events.return?.(undefined)
    environment.conversations.dispose()
    environment.database.close()
    await environment.observationSystem.observability.flush()
  })
})
