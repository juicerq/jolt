import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import { createBots } from "@src/engine/bots/bots"
import { createConversations } from "@src/engine/conversations/conversations"
import { createObservationSystem } from "@src/engine/observability/observability"
import { createPiAgentRuntime, type PiRuntimeEvent, type PiSessionFactory } from "@src/engine/pi/pi-agent-runtime"
import { openDatabase } from "@src/engine/persistence/database"
import { testDirectory } from "../../support/test-directory"

const directory = testDirectory("jots-conversations-")

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
  const conversations = createConversations({ database, bots, runtime, observability: observationSystem.observability })

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

    expect(events).toEqual([
      { type: "started" },
      { type: "text", text: "Resposta " },
      { type: "text", text: "confirmada" },
      { type: "finished", reason: "stop" },
    ])
    expect(first.prompts).toEqual(["Olá"])
    expect(first.instructions).toEqual(["You are Atlas.\nExpected outcome: Answer\nResponsibilities: Help\nLimits: Be safe\nDelivery: Text"])
    expect(first.conversations.history({ botId: bot.id }).map(({ author, content }) => ({ author, content }))).toEqual([
      { author: "person", content: "Olá" },
      { author: "bot", content: "Resposta confirmada" },
    ])

    first.conversations.dispose()
    first.database.close()
    const reopened = setup(first.databasePath)

    expect(reopened.conversations.history({ botId: bot.id }).map(({ author, content }) => ({ author, content }))).toEqual([
      { author: "person", content: "Olá" },
      { author: "bot", content: "Resposta confirmada" },
    ])

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
})
