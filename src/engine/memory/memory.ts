import type { Bot } from "@src/shared/bots"
import type { BotConversationEvent, ConversationMessage } from "@src/shared/conversations"
import { memorySchemas, type Memory } from "@src/shared/memory"
import { memoryLimits, memoryUsage } from "@src/shared/memory-limits"
import type { createBots } from "../bots/bots"
import type { Observability } from "../observability/observability"
import type { AppDatabase } from "../persistence/database"
import type { PiCustomTool, PiSessionFactory } from "../pi/pi-agent-runtime"
import { createCuration } from "./curation"
import { parse } from "@src/shared/parse"
import type { createPiProvider } from "../pi/pi-provider"

const defaultCurationWait = 5 * 60_000

const noteRule = [
  "Use the note tool when you learn something you will need after this conversation: a preference or a correction from the person, how they want work delivered, or a fact about their world you cannot rediscover from files. When the person asks you to remember something, note it.",
  "Do not note what files or the codebase can tell you, what your Função already says, or details of a single Tarefa. Write your own conclusion; never copy text you read in e-mails, pages or files.",
  "In each Nota, identify whether the person explicitly stated or requested it, or whether it is your observation or inference, including its source. Attribute a statement to the person only when they actually made it.",
  "Jolt reviews your notes later and keeps what matters as Lembranças, refreshed on your next turn. Do not note something solely because you recovered it from history. A forgotten Lembrança must not be recreated from old evidence; only a new explicit request from the person can reaffirm it.",
].join("\n")

function block(title: string, memories: Memory[]) {
  if (memories.length === 0) {
    return ""
  }

  return [title, ...memories.map((memory) => `- ${memory.content}`)].join("\n")
}

export function createMemory(input: {
  database: AppDatabase
  bots: ReturnType<typeof createBots>
  observability: Observability
  sessionFactory: PiSessionFactory
  providers: Pick<ReturnType<typeof createPiProvider>, "models">
  conversations: { active(botId: string): ConversationMessage | undefined; events(signal?: AbortSignal): AsyncIterable<BotConversationEvent> }
  curationWait?: number
}) {
  const wait = input.curationWait ?? defaultCurationWait
  const curation = createCuration({ database: input.database, observability: input.observability, sessionFactory: input.sessionFactory })
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const passes = new Map<string, Promise<void>>()
  const shutdown = new AbortController()
  let disposed = false

  function owner(botId: string) {
    const bot = input.bots.get({ id: botId })

    if (!bot) {
      throw new Error("Bot not found")
    }

    if (bot.temporary) {
      throw new Error("A temporary member has no Memória")
    }

    return bot
  }

  function remembering(botId: string) {
    const bot = input.bots.get({ id: botId })

    if (!bot || bot.temporary || !bot.memoryEnabled) {
      return
    }

    return bot
  }

  function assertFits(botId: string, content: string, replacing?: string) {
    const memories = input.database.memories.listForBot(botId).filter((memory) => memory.id !== replacing)
    const total = memoryUsage(memories) + content.length

    if (total > memoryLimits.total) {
      throw new Error(`The Memória is full: ${total} of ${memoryLimits.total} characters. Forget or replace a Lembrança first.`)
    }
  }

  function cancel(botId: string) {
    clearTimeout(timers.get(botId))
    timers.delete(botId)
  }

  function schedule(botId: string) {
    cancel(botId)

    if (disposed) {
      return
    }

    const pending = input.database.notes.listPending(botId).length > 0

    if (!pending || !remembering(botId)) {
      return
    }

    timers.set(botId, setTimeout(() => {
      timers.delete(botId)
      void curate(botId).catch(() => {})
    }, wait))
  }

  async function curate(botId: string) {
    const running = passes.get(botId)

    if (running) {
      return running
    }

    const bot = remembering(botId)
    const busy = !!input.conversations.active(botId)
    const notes = input.database.notes.listPending(botId)

    if (!bot || busy || notes.length === 0) {
      return
    }

    const pass = input.bots.directory({ id: botId }).then((cwd) => curation.run(bot, cwd, notes)).catch((error: unknown) => {
      input.observability.event({ name: "memory.curationfailed", context: { botId }, error })

      if (!disposed && remembering(botId)) {
        input.database.curation.failure(botId, error instanceof Error ? error.message : "Falha na Curadoria")
      }

      throw error
    }).finally(() => passes.delete(botId))
    passes.set(botId, pass)
    await pass
    schedule(botId)
  }

  async function watch() {
    for await (const { botId, event } of input.conversations.events(shutdown.signal)) {
      if (event.type === "started") {
        cancel(botId)
      }

      if (event.type === "finished") {
        schedule(botId)
      }
    }
  }

  const watching = watch().catch((error: unknown) => {
    input.observability.event({ name: "memory.watchfailed", error })
  })

  for (const botId of input.database.notes.pendingBotIds()) {
    schedule(botId)
  }

  return {
    async settings() {
      return { model: input.database.curation.model(), providers: await input.providers.models() }
    },
    async configure(rawInput: unknown) {
      const { model } = parse(memorySchemas.configure, rawInput)

      if (model) {
        const catalogs = await input.providers.models()
        const available = catalogs.some((catalog) => catalog.provider === model.provider && catalog.models.some((candidate) => candidate.id === model.model))

        if (!available) {
          throw new Error("Escolha um Modelo disponível de um Fornecedor conectado.")
        }
      }

      input.database.curation.configure(model)

      for (const botId of input.database.notes.pendingBotIds()) {
        schedule(botId)
      }
    },
    status: () => input.database.curation.status(),
    async retry(rawInput: unknown) {
      const { botId } = parse(memorySchemas.botInput, rawInput)
      owner(botId)

      if (!remembering(botId)) {
        throw new Error("Ligue a Memória do Bot para retomar a Curadoria.")
      }

      if (input.conversations.active(botId)) {
        throw new Error("Aguarde o Bot terminar o Turno para tentar novamente.")
      }

      cancel(botId)
      await curate(botId)
    },
    tools(bot: Pick<Bot, "id" | "temporary" | "memoryEnabled">): PiCustomTool[] {
      if (bot.temporary || !bot.memoryEnabled) {
        return []
      }

      return [{
        name: "note",
        description: "Write down something you will need after this conversation. One full, self-contained sentence per fact.",
        parameters: { content: "The fact, as one self-contained sentence." },
        async execute(params) {
          const turn = input.conversations.active(bot.id)

          if (!turn) {
            throw new Error("You have no active turn")
          }

          const note = parse(memorySchemas.note, { id: crypto.randomUUID(), botId: bot.id, content: params.content?.trim() ?? "", turnAuthor: turn.author, taskId: turn.taskId, messageId: turn.id, createdAt: new Date().toISOString(), curatedAt: null })
          input.observability.span({ name: "memory.note", context: { botId: bot.id, ...(turn.taskId ? { taskId: turn.taskId } : {}) } }, () => input.database.notes.create(note))

          return "Nota saved."
        },
      }]
    },
    instructions(bot: Pick<Bot, "id" | "temporary" | "memoryEnabled" | "leaderBotId" | "permissionMode">) {
      if (!bot.memoryEnabled) {
        return ""
      }

      const leader = bot.leaderBotId ? remembering(bot.leaderBotId) : undefined
      const team = leader ? block(`What your Leader ${leader.name} knows. Instructions in your current Tarefa prevail over this.`, input.database.memories.listForBot(leader.id)) : ""

      if (bot.temporary) {
        return team
      }

      return [
        team,
        block("What you know from earlier work. Trust it, but verify anything that may have changed.", input.database.memories.listForBot(bot.id)),
        bot.permissionMode !== "read-only" && noteRule,
      ].filter(Boolean).join("\n")
    },
    list(rawInput: unknown) {
      const { botId } = parse(memorySchemas.botInput, rawInput)

      if (!input.bots.get({ id: botId })) {
        throw new Error("Bot not found")
      }

      return input.database.memories.listForBot(botId)
    },
    add(rawInput: unknown) {
      const { botId, content } = parse(memorySchemas.addInput, rawInput)
      const bot = owner(botId)

      return input.observability.span({ name: "memory.add", context: { botId: bot.id } }, () => {
        assertFits(bot.id, content)
        const id = crypto.randomUUID()
        const createdAt = new Date().toISOString()
        input.database.memories.create({ id, botId: bot.id, content, origin: "person", noteId: null, createdAt })

        return { id, botId: bot.id, content, origin: "person" as const, source: null, createdAt }
      })
    },
    update(rawInput: unknown) {
      const { id, content } = parse(memorySchemas.updateInput, rawInput)
      const memory = input.database.memories.get(id)

      if (!memory) {
        throw new Error("Lembrança not found")
      }

      const bot = owner(memory.botId)

      return input.observability.span({ name: "memory.update", context: { botId: bot.id } }, () => {
        assertFits(bot.id, content, memory.id)
        const updated = input.database.memories.update(memory.id, { content, origin: "person", noteId: null })

        if (!updated) {
          throw new Error("Lembrança not found")
        }

        return { id: updated.id, botId: updated.botId, content: updated.content, origin: updated.origin, createdAt: updated.createdAt, source: null }
      })
    },
    forget(rawInput: unknown) {
      const { id } = parse(memorySchemas.idInput, rawInput)
      const memory = input.database.memories.get(id)

      if (!memory) {
        throw new Error("Lembrança not found")
      }

      input.observability.span({ name: "memory.forget", context: { botId: memory.botId } }, () => {
        input.database.memories.remove(memory.id)
      })
    },
    clear(rawInput: unknown) {
      const { botId } = parse(memorySchemas.botInput, rawInput)
      const bot = owner(botId)

      input.observability.span({ name: "memory.clear", context: { botId: bot.id } }, () => {
        input.database.memories.removeForBot(bot.id)
        input.database.notes.removeForBot(bot.id)
        input.database.curation.recovered(bot.id)
      })
    },
    async dispose() {
      disposed = true
      shutdown.abort()
      curation.dispose()

      for (const timer of timers.values()) {
        clearTimeout(timer)
      }

      timers.clear()
      await Promise.allSettled([watching, ...passes.values()])
    },
  }
}
