import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import { createBots } from "@src/engine/bots/bots"
import { createConversations } from "@src/engine/conversations/conversations"
import { createObservationSystem } from "@src/engine/observability/observability"
import { createPiAgentRuntime, type PiRuntimeEvent, type PiSessionFactory } from "@src/engine/pi/pi-agent-runtime"
import { openDatabase } from "@src/engine/persistence/database"
import { createTasks } from "@src/engine/tasks/tasks"
import { testDirectory } from "../../support/test-directory"

const directory = testDirectory("jolt-conversations-")

function setup(databasePath = join(directory, `${crypto.randomUUID()}.sqlite`), completePrompt = true) {
  const prompts: string[] = []
  const instructions: string[] = []
  const sessions = new Map<string, { listeners: Set<(event: PiRuntimeEvent) => void>; aborted: boolean }>()
  const sessionFactory: PiSessionFactory = {
    async open(input) {
      instructions.push(input.instructions ?? "")
      let finishPrompt: (() => void) | undefined
      const state = { listeners: new Set<(event: PiRuntimeEvent) => void>(), aborted: false }
      sessions.set(input.botId, state)

      return {
        sessionFile: join(directory, `${input.botId}.jsonl`),
        async prompt(message) {
          prompts.push(message)

          for (const listener of state.listeners) {
            listener({ type: "started" })
            listener({ type: "thinking-started" })
            listener({ type: "thinking", text: "Vou verificar o arquivo." })
            listener({ type: "thinking-finished" })
            listener({ type: "tool-started", callId: "read-1", tool: "read", detail: "PROJECT.md" })
            listener({ type: "tool-finished", callId: "read-1", tool: "read", failed: false })
            listener({ type: "tool-started", callId: "read-2", tool: "read", detail: "CONTEXT.md" })
            listener({ type: "tool-finished", callId: "read-2", tool: "read", failed: false })
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
            await new Promise<void>((resolve) => {
              finishPrompt = resolve
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
  const bots = createBots({ database, observability: observationSystem.observability, privateBotsDirectory: join(directory, "bots"), providers })
  const runtime = createPiAgentRuntime(sessionFactory, observationSystem.observability)
  const tasks = createTasks({ database, observability: observationSystem.observability })
  const conversations = createConversations({ database, bots, tasks, runtime, observability: observationSystem.observability })

  return { bots, conversations, database, databasePath, instructions, prompts, runtime, sessions, observationSystem }
}

describe("conversations", () => {
  test("streams a Bot response and persists the confirmed history", async () => {
    const first = setup()
    const bot = await first.bots.create({
      name: "Atlas",
      provider: "codex",
      function: { outcome: "Answer", responsibilities: "Help", limits: "Be safe", delivery: "Text" },
    })
    const events = []

    for await (const event of first.conversations.send({ botId: bot.id, content: "Olá" })) {
      events.push(event)
    }

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
    expect(first.instructions).toEqual(["You are Atlas.\nExpected outcome: Answer\nResponsibilities: Help\nLimits: Be safe\nDelivery: Text"])
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
        { callId: "read-2", name: "read", detail: "CONTEXT.md", status: "done" },
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

  test("aborts the active turn without persisting its partial response", async () => {
    const environment = setup(join(directory, `${crypto.randomUUID()}.sqlite`), false)
    const bot = await environment.bots.create({
      name: "Atlas",
      provider: "codex",
      function: { outcome: "Answer", responsibilities: "Help", limits: "Be safe", delivery: "Text" },
    })
    const stream = environment.conversations.send({ botId: bot.id, content: "Pare depois" })
    const iterator = stream[Symbol.asyncIterator]()
    await iterator.next()
    await environment.conversations.abort({ botId: bot.id })

    expect(environment.sessions.get(bot.id)?.aborted).toBe(true)
    expect(environment.conversations.history({ botId: bot.id }).map((message) => message.author)).toEqual(["person"])

    await iterator.next()
    environment.conversations.dispose()
    environment.database.close()
    await environment.observationSystem.observability.flush()
  })

  test("events carry every turn with its Bot and the incoming message", async () => {
    const environment = setup()
    const bot = await environment.bots.create({
      name: "Atlas",
      provider: "codex",
      function: { outcome: "Answer", responsibilities: "Help", limits: "Be safe", delivery: "Text" },
    })
    const events = environment.conversations.events()[Symbol.asyncIterator]()
    const first = events.next()

    for await (const _event of environment.conversations.send({ botId: bot.id, content: "Olá" })) {
      continue
    }

    expect((await first).value).toEqual({ botId: bot.id, event: { type: "started", message: { author: "person", authorBotId: null, taskId: null, content: "Olá" } } })
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
      function: { outcome: "Answer", responsibilities: "Help", limits: "Be safe", delivery: "Text" },
    })
    const stream = environment.conversations.send({ botId: bot.id, content: "Pare depois" })[Symbol.asyncIterator]()
    await stream.next()

    const events = environment.conversations.events()[Symbol.asyncIterator]()

    expect((await events.next()).value).toEqual({ botId: bot.id, event: { type: "started", message: { author: "person", authorBotId: null, taskId: null, content: "Pare depois" } } })
    await environment.conversations.abort({ botId: bot.id })
    await stream.next()
    await events.return?.(undefined)
    environment.conversations.dispose()
    environment.database.close()
    await environment.observationSystem.observability.flush()
  })
})
