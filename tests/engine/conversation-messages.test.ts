import { Database } from "bun:sqlite"
import { afterEach, beforeEach, expect, test } from "bun:test"
import { join } from "node:path"
import { createBots } from "@src/engine/bots/bots"
import { createConversations } from "@src/engine/conversations/conversations"
import { createObservationSystem } from "@src/engine/observability/observability"
import { openDatabase } from "@src/engine/persistence/database"
import { createPiAgentRuntime, type PiRuntimeEvent, type PiSessionFactory, type PiSessionInput } from "@src/engine/pi/pi-agent-runtime"
import { createTasks } from "@src/engine/tasks/tasks"
import { askTool, messageContentLimit, sendMessageTool } from "@src/shared/conversations"
import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"

const directory = mkdtempSync(join(tmpdir(), "mimo-messages-"))

beforeEach(() => mkdirSync(directory, { recursive: true }))
const cleanups: (() => Promise<void>)[] = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) {
    await cleanup()
  }

  rmSync(directory, { recursive: true, force: true })
})

async function conversation() {
  const { observability } = createObservationSystem({ appSessionId: "messages", logDirectory: join(directory, "logs"), development: false })
  const databasePath = join(directory, "mimo.sqlite")
  const database = openDatabase(databasePath, observability)
  const listeners = new Set<(event: PiRuntimeEvent) => void>()
  const opened = Promise.withResolvers<PiSessionInput>()
  const settled = Promise.withResolvers<void>()
  const emit = (event: PiRuntimeEvent) => {
    for (const listener of listeners) {
      listener(event)
    }
  }
  const factory: PiSessionFactory = {
    async open(input) {
      opened.resolve(input)

      return {
        async prompt() {
          emit({ type: "started" })
          await settled.promise
        },
        async steer() {},
        async compact() { return { tokensBefore: 0 } },
        async abort() {
          emit({ type: "finished", reason: "aborted" })
          settled.resolve()
        },
        subscribe(listener) {
          listeners.add(listener)

          return () => listeners.delete(listener)
        },
        dispose() { listeners.clear() },
      }
    },
  }
  const runtime = createPiAgentRuntime(factory, observability)
  const tasks = createTasks({ database, observability })
  const bots = createBots({
    database,
    observability,
    privateBotsDirectory: join(directory, "bots"),
    providers: { async list() { return [{ provider: "codex", name: "Codex", connection: "subscription", status: "available", connected: true, detectedKey: false }] } },
    conversations: { close: async (botId) => conversations.close(botId), isActive: (botId) => !!conversations.active(botId) },
  })
  const conversations = createConversations({ database, bots, tasks, runtime, observability, extensions: [] })
  cleanups.push(async () => {
    await conversations.dispose()
    await observability.flush()
    database.close()
  })
  const bot = await bots.create({ name: "Conversa" })
  const events = conversations.events()[Symbol.asyncIterator]()
  await conversations.send({ botId: bot.id, content: "Me explica com detalhes", images: [] })
  const session = await opened.promise
  const tool = (name: string) => {
    const found = session.customTools?.find((candidate) => candidate.name === name)

    if (!found || !("inputSchema" in found)) {
      throw new Error(`Missing tool ${name}`)
    }

    return found
  }

  return {
    bot,
    conversations,
    databasePath,
    observability,
    events,
    emit,
    tool,
    history: () => conversations.history({ botId: bot.id, limit: 100 }).messages,
    finish() {
      emit({ type: "finished", reason: "stop" })
      settled.resolve()
    },
  }
}

test("entrega cada mensagem durante o mesmo Turno e preserva a ordem ao reabrir o histórico", async () => {
  const c = await conversation()
  expect((await c.events.next()).value?.event.type).toBe("started")
  const messages = ["A entrega é gravada antes da confirmação.", "Depois o Bot investiga as evidências do erro."]

  for (const content of messages) {
    c.emit({ type: "tool-started", callId: content, tool: sendMessageTool })
    await c.tool(sendMessageTool).execute({ content })
    c.emit({ type: "tool-finished", callId: content, tool: sendMessageTool, failed: false })
    expect(c.conversations.active(c.bot.id)).toBeDefined()
    expect((await c.events.next()).value?.event).toMatchObject({ type: "message-finished", message: { content, question: null } })
    expect(c.history().at(-1)?.content).toBe(content)
  }

  c.emit({ type: "text", text: messages.join("\n\n") })
  c.emit({ type: "message-finished" })
  c.finish()
  expect((await c.events.next()).value?.event.type).toBe("finished")
  expect(c.conversations.active(c.bot.id)).toBeUndefined()
  const reopened = openDatabase(c.databasePath, c.observability)

  try {
    const history = reopened.conversations.history(c.bot.id, { limit: 100 }).messages.filter((message) => message.author === "bot")
    expect(history.map((message) => message.content)).toEqual(messages)
    expect(history.every((message) => message.activity?.steps.length === 0)).toBe(true)
  } finally {
    reopened.close()
  }
})

test("pergunta chega uma vez com opções e envios inválidos ou tardios não alteram o histórico", async () => {
  const c = await conversation()
  expect(await c.tool(sendMessageTool).execute({ content: "  " }).catch((error: unknown) => error)).toBeInstanceOf(Error)
  expect(await c.tool(sendMessageTool).execute({ content: "a".repeat(messageContentLimit + 1) }).catch((error: unknown) => error)).toMatchObject({ message: expect.stringContaining("This message is too long") })
  const question = { content: "Qual formato?", options: [{ value: "pdf", label: "PDF" }, { value: "md", label: "Markdown" }], allowOther: true, multiple: false }
  await c.tool(askTool).execute(question)
  c.emit({ type: "text", text: question.content })
  c.finish()
  expect(c.history().filter((message) => message.author === "bot")).toMatchObject([{ content: question.content, question: { options: question.options, allowOther: true, multiple: false } }])
  expect(await c.tool(sendMessageTool).execute({ content: "Envio tardio" }).catch((error: unknown) => error)).toMatchObject({ message: "No active conversation turn" })
  expect(c.history()).toHaveLength(2)
})

test("interromper preserva as mensagens enviadas e impede envios posteriores", async () => {
  const c = await conversation()
  await c.tool(sendMessageTool).execute({ content: "Achei a primeira evidência." })
  await c.conversations.abort({ botId: c.bot.id })
  expect(await c.tool(sendMessageTool).execute({ content: "Não deve chegar" }).catch((error: unknown) => error)).toBeInstanceOf(Error)
  expect(c.history().filter((message) => message.author === "bot").map(({ content, ending }) => ({ content, ending }))).toEqual([
    { content: "Achei a primeira evidência.", ending: null },
    { content: "", ending: "aborted" },
  ])
})


test("resposta sem envio termina com falha explícita, sem publicar o texto comum", async () => {
  const c = await conversation()
  expect((await c.events.next()).value?.event.type).toBe("started")
  c.emit({ type: "text", text: "Uma resposta que não foi enviada." })
  c.finish()
  expect(c.history().filter((message) => message.author === "bot")).toMatchObject([{ content: "", ending: "failed", error: expect.any(String) }])
  expect((await c.events.next()).value?.event).toMatchObject({ type: "message-finished", message: { ending: "failed" } })
  expect((await c.events.next()).value?.event).toMatchObject({ type: "finished", reason: "error" })
})


test("envio só confirma entrega depois de persistir a Mensagem", async () => {
  const c = await conversation()
  const writer = new Database(c.databasePath)

  try {
    writer.run("BEGIN IMMEDIATE")
    expect(await c.tool(sendMessageTool).execute({ content: "Achei a causa." }).catch((error: unknown) => error)).toBeInstanceOf(Error)
    expect(c.history()).toHaveLength(1)
  } finally {
    writer.run("ROLLBACK")
    writer.close()
  }

  await c.tool(sendMessageTool).execute({ content: "Achei a causa." })
  c.finish()
  expect(c.history().filter((message) => message.author === "bot").map((message) => message.content)).toEqual(["Achei a causa."])
})
