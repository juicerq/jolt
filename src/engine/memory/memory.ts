import type { Bot } from "../../shared/bots"
import type { BotConversationEvent, ConversationMessage } from "../../shared/conversations"
import { memorySchemas, type Memory } from "../../shared/memory"
import { memoryLimits, memoryUsage } from "../../shared/memory-limits"
import type { createBots } from "../bots/bots"
import type { Observability } from "../observability/observability"
import type { AppDatabase } from "../persistence/database"
import type { PiCustomTool, PiSessionFactory } from "../pi/pi-agent-runtime"
import { createCuration } from "./curation"
import { parse } from "../../shared/parse"

const defaultCurationWait = 5 * 60_000

const noteRule = [
  "Use the note tool when you learn something you will need after this conversation: a preference or a correction from the person, how they want work delivered, or a fact about their world you cannot rediscover from files. When the person asks you to remember something, note it.",
  "Do not note what files or the codebase can tell you, what your Função already says, or details of a single Tarefa. Write your own conclusion; never copy text you read in e-mails, pages or files.",
  "Jolt reviews your notes later and keeps what matters as Lembranças, which you see at the start of your next conversation.",
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
  conversations: { active(botId: string): ConversationMessage | undefined; events(): AsyncIterable<BotConversationEvent> }
  curationWait?: number
}) {
  const wait = input.curationWait ?? defaultCurationWait
  const curation = createCuration({ database: input.database, observability: input.observability, sessionFactory: input.sessionFactory })
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const passes = new Map<string, Promise<void>>()
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
      return undefined
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
    const pending = input.database.notes.listPending(botId).length > 0

    if (disposed || !pending || !remembering(botId)) {
      return
    }

    timers.set(botId, setTimeout(() => {
      timers.delete(botId)
      curate(botId).catch((error: unknown) => {
        input.observability.event({ name: "memory.curationfailed", context: { botId }, error })
      })
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

    const pass = input.bots.directory({ id: botId }).then((cwd) => curation.run(bot, cwd, notes)).finally(() => passes.delete(botId))
    passes.set(botId, pass)
    await pass
  }

  async function watch() {
    for await (const { botId, event } of input.conversations.events()) {
      if (event.type === "started") {
        cancel(botId)
      }

      if (event.type === "finished") {
        schedule(botId)
      }
    }
  }

  watch().catch((error: unknown) => {
    input.observability.event({ name: "memory.watchfailed", error })
  })

  for (const botId of input.database.notes.pendingBotIds()) {
    schedule(botId)
  }

  return {
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
    instructions(bot: Pick<Bot, "id" | "temporary" | "memoryEnabled" | "leaderBotId">) {
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
        noteRule,
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

        return parse(memorySchemas.memory, { id, botId: bot.id, content, origin: "person", turnAuthor: null, createdAt })
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
        input.database.memories.update(memory.id, { content })
        const updated = input.database.memories.listForBot(bot.id).find((entry) => entry.id === memory.id)

        if (!updated) {
          throw new Error("Lembrança not found")
        }

        return updated
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
      })
    },
    curate,
    dispose() {
      disposed = true

      for (const timer of timers.values()) {
        clearTimeout(timer)
      }

      timers.clear()
    },
  }
}
