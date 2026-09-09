import type { Bot } from "@src/shared/bots"
import type { BotConversationEvent, ConversationMessage } from "@src/shared/conversations"
import { memorySchemas, type AddMemoryInput, type ConfigureMemoryInput, type UpdateMemoryInput } from "@src/shared/memory"
import { memoryLimits, memoryUsage } from "@src/shared/memory-limits"
import type { createBots } from "../bots/bots"
import type { Observability } from "../observability/observability"
import type { AppDatabase } from "../persistence/database"
import type { PiSchemaTool, PiSessionFactory } from "../pi/pi-agent-runtime"
import { curate, memoryCurationVersion } from "./curation"
import { parse } from "@src/shared/parse"
import type { createPiProvider } from "../pi/pi-provider"

const curationWait = 5 * 60_000

const memoryRule = [
  "Mimo learns durable facts directly from your conversation after the turn. Do not claim a fact was saved before it appears in Memória.",
  "Use search_memories for questions about what you knew before, including superseded memories. Search a few distinctive keywords and try alternatives if needed. Superseded results are historical evidence, never current truth; look for later updates. Retrieval never reactivates a memory.",
  "Use read_history with a source message ID to inspect the original evidence. Say 'you said' only with an original person message, 'you recorded' for a person-controlled memory without one, and 'was recorded' if provenance is unknown. Recorded dates are not necessarily event dates.",
].join("\n")

function block(title: string, memories: { content: string }[]) {
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
}) {
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const passes = new Map<string, Promise<void>>()
  const shutdown = new AbortController()

  function owner(botId: string) {
    const bot = input.bots.get(botId)

    if (!bot) {
      throw new Error("Bot not found")
    }

    if (bot.temporary) {
      throw new Error("A temporary member has no Memória")
    }

    return bot
  }

  function remembering(botId: string) {
    const bot = input.bots.get(botId)

    if (!bot || bot.temporary || !bot.memoryEnabled) {
      return
    }

    return bot
  }

  function assertFits(botId: string, content: string, replacing?: string) {
    const memories = input.database.memories.activeForBot(botId).filter((memory) => memory.id !== replacing)
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

    if (shutdown.signal.aborted) {
      return
    }

    const pending = input.database.curation.pendingBotIds().includes(botId) || input.database.memories.hasOutdated(botId, memoryCurationVersion)

    if (!pending || !remembering(botId)) {
      return
    }

    timers.set(botId, setTimeout(() => {
      timers.delete(botId)
      void curatePending(botId).catch(() => {})
    }, curationWait))
  }

  async function curatePending(botId: string) {
    const running = passes.get(botId)

    if (running) {
      return running
    }

    const bot = remembering(botId)
    const busy = !!input.conversations.active(botId)
    const batch = input.database.curation.batch(botId)

    const outdated = input.database.memories.hasOutdated(botId, memoryCurationVersion)

    if (!bot || busy || (batch.through === batch.after && !outdated)) {
      return
    }

    const pass = input.bots.directory(botId).then((cwd) => curate({ database: input.database, observability: input.observability, sessionFactory: input.sessionFactory, bot, cwd, batch, signal: shutdown.signal })).catch((error: unknown) => {
      input.observability.event({ name: "memory.curationfailed", context: { botId }, error })

      if (!shutdown.signal.aborted && remembering(botId) && (input.database.curation.pendingBotIds().includes(botId) || input.database.memories.hasOutdated(botId, memoryCurationVersion))) {
        input.database.curation.failure(botId, error instanceof Error ? error.message : "Falha na Curadoria")
      }

      schedule(botId)
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

  for (const botId of new Set([...input.database.curation.pendingBotIds(), ...input.database.memories.outdatedBotIds(memoryCurationVersion)])) {
    schedule(botId)
  }

  return {
    async settings() {
      return { model: input.database.curation.model(), providers: await input.providers.models() }
    },
    async configure({ model }: ConfigureMemoryInput) {
      if (model) {
        const catalogs = await input.providers.models()
        const available = catalogs.some((catalog) => catalog.provider === model.provider && catalog.models.some((candidate) => candidate.id === model.model))

        if (!available) {
          throw new Error("Escolha um Modelo disponível de um Fornecedor conectado.")
        }
      }

      input.database.curation.configure(model)

      for (const botId of new Set([...input.database.curation.pendingBotIds(), ...input.database.memories.outdatedBotIds(memoryCurationVersion)])) {
        schedule(botId)
      }
    },
    status: () => input.database.curation.status(),
    async retry(botId: string) {
      owner(botId)

      if (!remembering(botId)) {
        throw new Error("Ligue a Memória do Bot para retomar a Curadoria.")
      }

      if (input.conversations.active(botId)) {
        throw new Error("Aguarde o Bot terminar o Turno para tentar novamente.")
      }

      cancel(botId)
      await curatePending(botId)
    },
    tools(bot: Pick<Bot, "id" | "temporary" | "memoryEnabled">): PiSchemaTool[] {
      if (bot.temporary || !bot.memoryEnabled) {
        return []
      }

      return [{
        name: "search_memories",
        label: "Pesquisar Memórias",
        description: "Search your own active and superseded memories. All keywords must match; accents and case are ignored. Superseded results are historical, not current truth.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "A few distinctive keywords." },
            after: { type: "string", description: "Inclusive recorded UTC date, YYYY-MM-DD." },
            before: { type: "string", description: "Inclusive recorded UTC date, YYYY-MM-DD." },
            offset: { type: "integer", description: "Use nextOffset to continue the search." },
          },
          required: ["query"],
          additionalProperties: false,
        },
        async execute(raw) {
          if (!remembering(bot.id)) {
            throw new Error("Memória is disabled")
          }

          const search = parse(memorySchemas.search, raw)

          if (search.after && search.before && search.after > search.before) {
            throw new Error("after must be on or before before")
          }

          return JSON.stringify(input.database.memories.search(bot.id, search))
        },
      }]
    },
    instructions(bot: Pick<Bot, "id" | "temporary" | "memoryEnabled" | "leaderBotId" | "permissionMode">) {
      if (!bot.memoryEnabled) {
        return ""
      }

      const leader = bot.leaderBotId ? remembering(bot.leaderBotId) : undefined
      const team = leader ? block(`What your Leader ${leader.name} knows. Instructions in your current Tarefa prevail over this.`, input.database.memories.activeForBot(leader.id)) : ""

      if (bot.temporary) {
        return team
      }

      return [
        team,
        block("What you know from earlier work. Trust it, but verify anything that may have changed.", input.database.memories.activeForBot(bot.id)),
        memoryRule,
      ].filter(Boolean).join("\n")
    },
    list(botId: string) {
      if (!input.bots.get(botId)) {
        throw new Error("Bot not found")
      }

      return input.database.memories.listForBot(botId)
    },
    add({ botId, content }: AddMemoryInput) {
      const bot = owner(botId)

      return input.observability.span({ name: "memory.add", context: { botId: bot.id } }, () => {
        assertFits(bot.id, content)

        const memory = { id: crypto.randomUUID(), botId: bot.id, content, origin: "person" as const, sourceMessageId: null, supersededAt: null, supersededByMessageId: null, curationVersion: memoryCurationVersion, createdAt: new Date().toISOString() }

        input.database.memories.create(memory)

        const { curationVersion: _curationVersion, ...result } = memory

        return { ...result, source: null, supersededBy: null }
      })
    },
    update({ id, content }: UpdateMemoryInput) {
      const memory = input.database.memories.get(id)

      if (!memory) {
        throw new Error("Lembrança not found")
      }

      const bot = owner(memory.botId)

      return input.observability.span({ name: "memory.update", context: { botId: bot.id } }, () => {
        if (memory.supersededAt) {
          throw new Error("Uma Lembrança superada preserva o texto antigo. Adicione uma nova Lembrança.")
        }

        assertFits(bot.id, content, memory.id)
        const updated = input.database.memories.update(memory.id, { content, origin: "person", sourceMessageId: null, curationVersion: memoryCurationVersion, createdAt: new Date().toISOString() })

        if (!updated) {
          throw new Error("Lembrança not found")
        }

        const { curationVersion: _curationVersion, ...result } = updated

        return { ...result, source: null, supersededBy: null }
      })
    },
    forget(id: string) {
      const memory = input.database.memories.get(id)

      if (!memory) {
        throw new Error("Lembrança not found")
      }

      input.observability.span({ name: "memory.forget", context: { botId: memory.botId } }, () => {
        input.database.memories.remove(memory.id)
      })
    },
    clear(botId: string) {
      const bot = owner(botId)

      input.observability.span({ name: "memory.clear", context: { botId: bot.id } }, () => {
        input.database.memories.removeForBot(bot.id)
        input.database.curation.skip(bot.id)
      })
    },
    async dispose() {
      shutdown.abort()

      for (const timer of timers.values()) {
        clearTimeout(timer)
      }

      timers.clear()
      await Promise.allSettled([watching, ...passes.values()])
    },
  }
}
