import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import { parseArgs } from "node:util"
import { defaultBotAvatarSeed } from "@src/shared/bot-avatar"
import type { StoredBot } from "@src/shared/bots"
import type { ConversationActivity, ConversationMessage } from "@src/shared/conversations"
import type { Task } from "@src/shared/tasks"
import { createObservationSystem } from "../observability/observability"
import { openDatabase } from "./database"

type Random = () => number

interface SeedBot {
  name: string
  turns: number
  members?: { name: string; turns: number }[]
}

const seedBots: SeedBot[] = [
  { name: "Leve", turns: 20 },
  { name: "Média", turns: 150 },
  { name: "Pesada", turns: 600 },
  { name: "Enorme", turns: 1500 },
  { name: "Coordenador", turns: 200, members: [{ name: "Pesquisador", turns: 100 }, { name: "Redator", turns: 100 }] },
]

const pixelPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="

const personPrompts = [
  "Revise o módulo de cobrança e liste o que precisa mudar.",
  "Escreva um resumo das últimas reuniões de produto.",
  "Compare as três abordagens e recomende uma.",
  "Por que o build falhou ontem à noite?",
  "Gere os testes para a função de cálculo de frete.",
  "Explique o fluxo de autenticação para uma pessoa nova no time.",
  "Quais arquivos mudaram desde a última release?",
]

const paragraphs = [
  "A rotina lê o arquivo de configuração, valida cada campo com o schema e só então abre a conexão com o banco. Quando um campo falta, o processo para na validação e devolve a linha exata do erro.",
  "O maior custo está na serialização. Cada item passa por três conversões antes de chegar ao cliente, e duas delas produzem o mesmo formato. Remover a intermediária corta metade do tempo.",
  "Recomendo a segunda opção. Ela mantém a interface atual, não exige migração e o teste de carga mostrou o mesmo p95 da primeira com um terço do código.",
  "O relatório abaixo cobre os arquivos alterados, o motivo de cada mudança e o que ainda falta verificar antes de publicar.",
]

const bulletLists = [
  ["`billing/invoice.ts`: o desconto é aplicado duas vezes quando há cupom e crédito.", "`billing/tax.ts`: arredondamento acontece antes da soma.", "`billing/index.ts`: exporta uma função que ninguém chama."],
  ["Compilar o Engine antes dos testes.", "Rodar a suíte com quatro workers.", "Publicar o relatório na pasta de saída."],
  ["**Opção A**: rápida de implementar, porém duplica a regra.", "**Opção B**: reaproveita o módulo existente e centraliza a validação.", "**Opção C**: exige nova tabela e migração."],
]

const codeBlocks = [
  ["```ts", "export function totalWithDiscount(items: Item[], discount: Discount) {", "  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0)", "", "  if (discount.kind === \"percent\") {", "    return subtotal * (1 - discount.value / 100)", "  }", "", "  return Math.max(0, subtotal - discount.value)", "}", "```"],
  ["```json", "{", "  \"name\": \"jolt\",", "  \"workers\": 4,", "  \"retries\": 0,", "  \"paths\": [\"src\", \"tests\"]", "}", "```"],
  ["```sh", "bun run build:engine", "bun test tests --no-orphans --parallel=4", "```"],
  ["```ts", "const invoice = await client.invoices.get({ id })", "", "if (!invoice) {", "  throw new Error(\"Invoice not found\")", "}", "", "return present(invoice)", "```"],
]

const table = ["| Arquivo | Linhas | Estado |", "| --- | --- | --- |", "| `billing/invoice.ts` | 212 | revisar |", "| `billing/tax.ts` | 88 | ok |", "| `billing/index.ts` | 14 | remover |"]

const toolNames = ["Read", "Bash", "Edit", "Grep"] as const

function mulberry32(seed: number): Random {
  let state = seed

  return () => {
    state = (state + 0x6d2b79f5) | 0
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value

    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T>(random: Random, items: readonly T[]) {
  const item = items[Math.floor(random() * items.length)]

  if (item === undefined) {
    throw new Error("Cannot pick from an empty list")
  }

  return item
}

function botMarkdown(random: Random) {
  const sections = 1 + Math.floor(random() * 4)
  const parts: string[] = [`## ${pick(random, ["Resultado", "Diagnóstico", "Plano", "Resumo"])}`, "", pick(random, paragraphs)]

  for (let index = 0; index < sections; index += 1) {
    const kind = random()

    if (kind < 0.35) {
      parts.push("", ...pick(random, bulletLists).map((item) => `- ${item}`))
    } else if (kind < 0.7) {
      parts.push("", ...pick(random, codeBlocks))
    } else if (kind < 0.85) {
      parts.push("", ...table)
    } else {
      parts.push("", pick(random, paragraphs))
    }
  }

  return parts.join("\n")
}

function botActivity(random: Random): ConversationActivity | null {
  if (random() < 0.3) {
    return null
  }

  const steps: ConversationActivity["steps"] = [{ type: "thinking", content: pick(random, paragraphs), durationMs: 800 + Math.floor(random() * 12_000) }]
  const toolSteps = Math.floor(random() * 4)

  for (let index = 0; index < toolSteps; index += 1) {
    const name = pick(random, toolNames)
    const failed = random() < 0.08

    steps.push({
      type: "tool",
      name,
      tools: [{ callId: crypto.randomUUID(), name, detail: `src/billing/${pick(random, ["invoice", "tax", "index"])}.ts`, status: failed ? "failed" : "done", ...(failed ? { error: "Arquivo não encontrado" } : {}) }],
    })
  }

  return { steps }
}

function turnEnding(random: Random): ConversationMessage["ending"] {
  const roll = random()

  if (roll < 0.03) {
    return "aborted"
  }

  if (roll < 0.05) {
    return "failed"
  }

  return null
}

export async function seedLoadDatabase(userDataDirectory: string, seed = 1) {
  const random = mulberry32(seed)
  const clock = { at: Date.parse("2026-01-05T09:00:00.000Z") }
  const nextTimestamp = () => {
    clock.at += 30_000 + Math.floor(random() * 600_000)

    return new Date(clock.at).toISOString()
  }
  const botsDirectory = join(userDataDirectory, "bots")
  const { observability } = createObservationSystem({ appSessionId: crypto.randomUUID(), logDirectory: join(userDataDirectory, "logs"), development: false })
  const database = openDatabase(join(userDataDirectory, "jolt.sqlite"), observability)
  const created: { name: string; messages: number }[] = []

  async function createBot(name: string, leaderBotId: string | null): Promise<StoredBot> {
    const bot: StoredBot = {
      id: crypto.randomUUID(),
      leaderBotId,
      projectId: null,
      name,
      avatarSeed: defaultBotAvatarSeed(name),
      provider: "codex",
      function: { outcome: `Entregar o trabalho de ${name} com histórico de carga para medir a interface.` },
      workingDirectoryOverride: null,
      temporary: false,
      memoryEnabled: true,
      effort: "medium",
      model: null,
      permissionMode: "ask",
      createdAt: nextTimestamp(),
    }

    await mkdir(join(botsDirectory, bot.id), { recursive: true })
    database.bots.create(bot)

    return bot
  }

  function append(message: Omit<ConversationMessage, "id" | "createdAt">) {
    database.conversations.append({ ...message, id: crypto.randomUUID(), createdAt: nextTimestamp() })
  }

  function personTurn(botId: string) {
    const roll = random()
    const images = roll < 0.05 ? [{ data: pixelPng, mimeType: "image/png" as const }] : []
    const author = roll > 0.95 ? "routine" : "person"

    append({ botId, author, authorBotId: null, taskId: null, content: pick(random, personPrompts), images, question: null, replyTo: null, activity: null, ending: null })
    append({ botId, author: "bot", authorBotId: botId, taskId: null, content: botMarkdown(random), images: [], question: null, replyTo: null, activity: botActivity(random), ending: turnEnding(random) })
  }

  function delegatedTurn(leader: StoredBot, member: StoredBot) {
    const task: Task = { id: crypto.randomUUID(), callerBotId: leader.id, assigneeBotId: member.id, outcome: pick(random, personPrompts), status: random() < 0.9 ? "done" : "failed", createdAt: nextTimestamp(), finishedAt: null }

    database.tasks.create(task)
    append({ botId: member.id, author: "bot", authorBotId: leader.id, taskId: task.id, content: task.outcome, images: [], question: null, replyTo: null, activity: null, ending: null })
    append({ botId: member.id, author: "bot", authorBotId: member.id, taskId: task.id, content: botMarkdown(random), images: [], question: null, replyTo: null, activity: botActivity(random), ending: null })
    append({ botId: leader.id, author: "bot", authorBotId: member.id, taskId: task.id, content: botMarkdown(random), images: [], question: null, replyTo: null, activity: null, ending: null })
    database.tasks.update(task.id, { finishedAt: nextTimestamp() })
  }

  for (const definition of seedBots) {
    const bot = await createBot(definition.name, null)
    const members = await Promise.all((definition.members ?? []).map(async (member) => ({ bot: await createBot(member.name, bot.id), turns: member.turns })))

    for (let turn = 0; turn < definition.turns; turn += 1) {
      for (const member of members) {
        delegatedTurn(bot, member.bot)
      }

      personTurn(bot.id)
    }

    for (const member of members) {
      for (let turn = 0; turn < member.turns; turn += 1) {
        personTurn(member.bot.id)
      }
    }

    for (const entry of [bot, ...members.map((member) => member.bot)]) {
      const last = database.conversations.history(entry.id, { limit: 1 })

      created.push({ name: entry.name, messages: last.messages.length + last.earlier })
    }
  }

  database.close()
  await observability.flush()

  return created
}

if (import.meta.main) {
  const { values } = parseArgs({ args: Bun.argv.slice(2), options: { "user-data": { type: "string", default: ".jolt-load" }, seed: { type: "string", default: "1" } } })
  const userDataDirectory = join(process.cwd(), values["user-data"])
  const databaseExists = await Bun.file(join(userDataDirectory, "jolt.sqlite")).exists()

  if (databaseExists) {
    throw new Error(`${userDataDirectory} já tem um banco. Apague a pasta antes de gerar de novo.`)
  }

  await mkdir(userDataDirectory, { recursive: true })

  const created = await seedLoadDatabase(userDataDirectory, Number(values.seed))

  console.table(created)
  console.log(`Banco criado em ${userDataDirectory}. Rode: JOLT_USER_DATA=${userDataDirectory} bun run dev`)
}
