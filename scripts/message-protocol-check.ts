import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parseArgs } from "node:util"
import type { Bot } from "@src/shared/bots"
import { askTool, type TurnContext } from "@src/shared/conversations"
import { botInstructions } from "@src/engine/conversations/bot-instructions"
import type { PiRuntimeEvent, PiTool } from "@src/engine/pi/pi-agent-runtime"
import { createPiModels } from "@src/engine/pi/pi-models"
import { createPiSessionFactory } from "@src/engine/pi/pi-session-adapter"

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    model: { type: "string", default: "grok-4.6" },
    provider: { type: "string", default: "opencode" },
    runs: { type: "string", default: "3" },
    scenario: { type: "string", multiple: true, default: [] },
  },
})

const provider = values.provider === "codex" ? "codex" : "opencode"

const routineInstructions = [
  "A turn with cause \"routine\" is a scheduled call from one of your Rotinas, not from the person. Do what it asks and reply briefly; say \"nothing new\" when there is nothing to report.",
  "Use the routine tool once when the person asks you to check or do something on a schedule. Give the Rotina a short name and express repeated calls as one schedule. A one-time Rotina remains listed as completed or failed after its call. Use remove_routine to remove one for good.",
  "Your Rotinas:",
  "- 01c58f3c: \"resumo-gmail-minuto\" — Verifique a caixa de entrada do Gmail e resuma as mensagens novas desde a última verificação. Se não houver nada novo, responda apenas \"nada novo\", every 10 minutes, active",
].join("\n")

const bot: Bot = {
  id: "protocol-check",
  avatarSeed: "jolt:new:Teste",
  leaderBotId: null,
  projectId: null,
  name: "Teste",
  provider,
  function: { outcome: "Ajudar no que você precisar" },
  workingDirectoryOverride: null,
  temporary: false,
  memoryEnabled: true,
  effort: "xhigh",
  model: values.model,
  permissionMode: "full",
  createdAt: new Date().toISOString(),
  effectiveWorkingDirectory: ".",
  closed: false,
  colleagueIds: [],
}

const inbox = [
  "Mercado Livre — alerta de segurança: acesso em um navegador novo hoje às 07:47",
  "GitHub — 3 workflows falharam",
  "Nubank — pagamento da fatura realizado",
]

interface Scenario {
  name: string
  content: string
  context: TurnContext
  gmail?: "full" | "empty"
}

const moment = { startedAt: new Date().toISOString(), timeZone: "America/Sao_Paulo" }
const routineContext: TurnContext = { cause: "routine", routineId: "01c58f3c", frequency: { form: "interval", everyMinutes: 10, days: ["monday"], startTime: "00:00", endTime: "23:59" }, scheduledFor: new Date().toISOString(), ...moment }
const routineContent = "Verifique a caixa de entrada do Gmail e resuma as mensagens novas desde a última verificação. Se não houver nada novo, responda apenas \"nada novo\"."

const scenarios: Scenario[] = [
  { name: "person-tool", content: "Rode ls -la na sua pasta e depois me diga o que apareceu", context: { cause: "person", ...moment } },
  { name: "person-plain", content: "o que voce consegue fazer por mim?", context: { cause: "person", ...moment } },
  { name: "routine-first", content: routineContent, context: routineContext, gmail: "full" },
  { name: "routine-empty", content: routineContent, context: routineContext, gmail: "empty" },
]

interface Turn {
  scenario: string
  messages: string[]
  toolsBeforeFirstMessage: string[]
  sequence: string[]
  asked: number
  durationMs: number
  error?: string
}

async function runTurn(scenario: Scenario, cwd: string, sessionsDirectory: string, agentDirectory: string): Promise<Turn> {
  const messages: string[] = []
  const toolsBeforeFirstMessage: string[] = []
  const sequence: string[] = []
  let asked = 0
  let text = ""
  let failure: string | undefined

  function speak() {
    const content = text.trim()

    text = ""

    if (content) {
      messages.push(content)
    }
  }

  const factory = createPiSessionFactory({ agentDirectory, sessionsDirectory, models })
  const gmailTool: PiTool = {
    name: "gmail_search",
    label: "Pesquisa no Gmail",
    description: "Search the Gmail inbox of the connected account.",
    parameters: { query: "Gmail search query" },
    async execute() {
      if (scenario.gmail === "empty") {
        return "No messages matched."
      }

      return inbox.map((line) => `- ${line}`).join("\n")
    },
  }
  const askToolDefinition: PiTool = {
    name: askTool,
    description: "Ask the person to choose between options. This ends your turn: say what you need in content, list the options, then stop.",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "The question the person will read" },
        options: { type: "array", minItems: 2, maxItems: 12, items: { type: "object", properties: { value: { type: "string" }, label: { type: "string" } }, required: ["value", "label"], additionalProperties: false } },
        allowOther: { type: "boolean", description: "Whether the person may write a different answer" },
      },
      required: ["content", "options", "allowOther"],
      additionalProperties: false,
    },
    async execute(params: Record<string, unknown>) {
      asked++
      messages.push(typeof params.content === "string" ? params.content : "")

      return "Question sent. Stop now and wait for the person to answer in a new turn."
    },
  }
  const customTools = scenario.gmail ? [askToolDefinition, gmailTool] : [askToolDefinition]
  const tools = ["read", "grep", "find", "ls", "bash", "edit", "write", ...customTools.map((tool) => tool.name)]
  const session = await factory.open({
    botId: bot.id,
    cwd,
    tools,
    provider,
    effort: bot.effort,
    model: values.model,
    permissionMode: "full",
    policy: { botId: bot.id, allowedRoot: cwd, mode: "full" },
    customTools,
    ephemeral: true,
    instructions: botInstructions({ bot, extensions: [routineInstructions] }),
  })
  const started = Bun.nanoseconds()
  const unsubscribe = session.subscribe((event: PiRuntimeEvent) => {
    if (event.type === "text") {
      text += event.text
    }

    if (event.type === "tool-started") {
      speak()
      sequence.push(`+${event.tool}`)

      if (event.tool !== askTool && messages.length === 0) {
        toolsBeforeFirstMessage.push(event.tool)
      }
    }

    if (event.type === "tool-finished") {
      sequence.push(`${event.failed ? "!" : "-"}${event.tool}`)
    }

    if ((event.type === "finished" || event.type === "message-finished") && event.error) {
      failure = event.error
    }
  })
  await session.prompt({ content: scenario.content, context: scenario.context }).catch((error: unknown) => { failure = String(error) })

  speak()
  unsubscribe()
  session.dispose()

  return {
    scenario: scenario.name,
    messages,
    sequence,
    toolsBeforeFirstMessage,
    asked,
    durationMs: Math.round((Bun.nanoseconds() - started) / 1e6),
    ...(failure ? { error: failure } : {}),
  }
}

const models = createPiModels()
const root = await mkdtemp(join(tmpdir(), "jolt-protocol-"))
const cwd = join(root, "bot")
const sessionsDirectory = join(root, "sessions")
const agentDirectory = join(root, "agent")
await Bun.$`mkdir -p ${cwd} ${sessionsDirectory} ${agentDirectory}`.quiet()

const selected = values.scenario.length > 0 ? scenarios.filter((scenario) => values.scenario.includes(scenario.name)) : scenarios
const runs = Number(values.runs)
const turns: Turn[] = []

for (const scenario of selected) {
  for (let run = 0; run < runs; run++) {
    const turn = await runTurn(scenario, cwd, sessionsDirectory, agentDirectory).catch((error: unknown) => ({ scenario: scenario.name, messages: [], sequence: [], toolsBeforeFirstMessage: [], asked: 0, durationMs: 0, error: String(error) }))

    turns.push(turn)
    console.log(JSON.stringify(turn))
  }
}

console.log(`\nmodel ${values.model}, ${runs} runs per scenario`)

for (const scenario of selected) {
  const own = turns.filter((turn) => turn.scenario === scenario.name)
  const silent = own.filter((turn) => turn.messages.length === 0).length
  const openedFirst = own.filter((turn) => turn.toolsBeforeFirstMessage.length === 0).length
  const messages = own.reduce((sum, turn) => sum + turn.messages.length, 0) / own.length
  const duration = own.reduce((sum, turn) => sum + turn.durationMs, 0) / own.length
  const failed = own.filter((turn) => turn.error).length

  console.log(`${scenario.name}: messages ${messages.toFixed(1)}, opened before work ${openedFirst}/${own.length}, silent ${silent}/${own.length}, asked ${own.reduce((sum, turn) => sum + turn.asked, 0)}, ${Math.round(duration)}ms, errors ${failed}`)
}

await rm(root, { recursive: true, force: true })
