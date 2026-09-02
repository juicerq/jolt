import type { Bot } from "../../shared/bots"
import { memorySchemas, type Memory, type Note } from "../../shared/memory"
import { memoryLimits, memoryUsage } from "../../shared/memory-limits"
import type { Observability } from "../observability/observability"
import type { AppDatabase } from "../persistence/database"
import type { PiCustomTool, PiSessionFactory } from "../pi/pi-agent-runtime"
import { parse } from "../../shared/parse"

const rules = [
  "You curate the Memória of a Bot: you decide which Notas become Lembranças, which Lembranças change and which are forgotten. You have the remember, replace and forget tools and nothing else. Do not answer questions.",
  "A Nota from a person turn is a request from the person: keep it. A Nota from a routine or bot turn is an observation: keep it only when it repeats or when the person confirmed it.",
  "A repeated fact is one Lembrança. When two facts contradict, the newer replaces the older. Forget what became obsolete.",
  "Never copy text from outside. Write the conclusion, as one self-contained sentence.",
  `A Lembrança has at most ${memoryLimits.memory} characters and the Memória has at most ${memoryLimits.total}. When remember fails on the Limite, forget or replace a Lembrança first.`,
  "When you are done, reply with one line saying what changed.",
].join("\n")

function origin(memory: Memory) {
  if (memory.origin === "person") {
    return "from the person"
  }

  return `from a ${memory.turnAuthor ?? "bot"} turn`
}

function describe(bot: Pick<Bot, "name" | "function">, memories: Memory[], notes: Note[]) {
  const kept = memories.length === 0
    ? "The Memória is empty."
    : ["Lembranças:", ...memories.map((memory) => `- ${memory.id} (${memory.content.length} chars, ${origin(memory)}): ${memory.content}`)].join("\n")

  return [
    `Bot: ${bot.name}. Função: ${bot.function.outcome}.`,
    bot.function.description && `Responsibilities, limits and delivery: ${bot.function.description}`,
    kept,
    ["Notas pendentes:", ...notes.map((note) => `- ${note.id} (${note.turnAuthor} turn, ${note.createdAt}): ${note.content}`)].join("\n"),
    "Curate the Memória now.",
  ].filter(Boolean).join("\n")
}

export function createCuration(input: { database: AppDatabase; observability: Observability; sessionFactory: PiSessionFactory }) {
  function assertRoom(botId: string, content: string, replacing?: string) {
    const kept = input.database.memories.listForBot(botId).filter((memory) => memory.id !== replacing)
    const total = memoryUsage(kept) + content.length

    if (total > memoryLimits.total) {
      throw new Error([
        `The Memória is full: ${total} of ${memoryLimits.total} characters. Forget or replace a Lembrança first.`,
        ...kept.map((memory) => `- ${memory.id}: ${memory.content.length} chars`),
      ].join("\n"))
    }
  }

  function existing(botId: string, id: string) {
    const memory = input.database.memories.get(id)

    if (!memory || memory.botId !== botId) {
      throw new Error("Lembrança not found")
    }

    return memory
  }

  function tools(botId: string, notes: Note[]): PiCustomTool[] {
    return [
      {
        name: "remember",
        description: "Keep a Nota as a Lembrança. One self-contained sentence.",
        parameters: { content: "The Lembrança, as one self-contained sentence.", note: "Id of the Nota it comes from." },
        async execute(params) {
          const note = notes.find((candidate) => candidate.id === params.note)

          if (!note) {
            throw new Error("Nota not found")
          }

          const memory = parse(memorySchemas.storedMemory, { id: crypto.randomUUID(), botId, content: params.content?.trim() ?? "", origin: "bot", noteId: note.id, createdAt: new Date().toISOString() })
          assertRoom(botId, memory.content)
          input.database.memories.create(memory)

          return "Lembrança kept."
        },
      },
      {
        name: "replace",
        description: "Rewrite a Lembrança. Use it when a fact changed or two Lembranças say the same.",
        parameters: { id: "Id of the Lembrança.", content: "The new text, as one self-contained sentence." },
        async execute(params) {
          const memory = existing(botId, params.id ?? "")
          const updated = parse(memorySchemas.storedMemory, { ...memory, content: params.content?.trim() ?? "" })
          assertRoom(botId, updated.content, memory.id)
          input.database.memories.update(memory.id, { content: updated.content })

          return "Lembrança replaced."
        },
      },
      {
        name: "forget",
        description: "Forget a Lembrança that is obsolete or wrong.",
        parameters: { id: "Id of the Lembrança." },
        async execute(params) {
          const memory = existing(botId, params.id ?? "")
          input.database.memories.remove(memory.id)

          return "Lembrança forgotten."
        },
      },
    ]
  }

  return {
    run(bot: Pick<Bot, "id" | "name" | "function" | "effort" | "model">, cwd: string, notes: Note[]) {
      return input.observability.span({ name: "memory.curate", context: { botId: bot.id }, attributes: { count: notes.length } }, async () => {
        const customTools = tools(bot.id, notes)
        const session = await input.sessionFactory.open({
          botId: bot.id,
          cwd,
          tools: customTools.map((tool) => tool.name),
          effort: bot.effort,
          model: bot.model,
          policy: { botId: bot.id, allowedRoot: cwd, mode: "full" },
          customTools,
          instructions: rules,
          ephemeral: true,
        })
        const finished = new Promise<"stop" | "aborted" | "error">((resolve) => {
          session.subscribe((event) => {
            if (event.type === "finished") {
              resolve(event.reason)
            }
          })
        })
        const outcome = await session.prompt({ content: describe(bot, input.database.memories.listForBot(bot.id), notes) }).then(() => finished, (error: unknown) => error instanceof Error ? error : new Error(String(error)))
        session.dispose()

        if (outcome instanceof Error) {
          throw outcome
        }

        if (outcome !== "stop") {
          throw new Error(`The Curadoria ended with ${outcome}`)
        }

        input.database.notes.markCurated(notes.map((note) => note.id), new Date().toISOString())
      })
    },
  }
}
