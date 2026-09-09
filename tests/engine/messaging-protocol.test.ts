import { afterEach, expect, spyOn, test } from "bun:test"
import { InMemoryCredentialStore, fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai"
import { ModelRuntime } from "@earendil-works/pi-coding-agent"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createConversationTools } from "@src/engine/conversations/conversation-tools"
import { createObservationSystem } from "@src/engine/observability/observability"
import { createPiModels } from "@src/engine/pi/pi-models"
import { createPiSessionFactory } from "@src/engine/pi/pi-session-adapter"
import { reportTaskTool } from "@src/shared/tasks"
import { finishSilentlyTool, sendMessageTool } from "@src/shared/conversations"

const cleanups: (() => Promise<unknown> | void)[] = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup()
  }
})

async function protocolSession(tools: ReturnType<typeof createConversationTools>, mode: "read-only" | "full" = "read-only") {
  const root = await mkdtemp(join(tmpdir(), "mimo-protocol-test-"))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  const { observability } = createObservationSystem({ appSessionId: "protocol", logDirectory: join(root, "logs"), development: false })
  cleanups.push(() => observability.flush())
  const models = createPiModels()
  const faux = fauxProvider({ tokensPerSecond: 0 })
  const modelRuntime = await ModelRuntime.create({ credentials: new InMemoryCredentialStore(), modelsPath: null, modelsStorePath: join(root, "models.json"), refreshOnCreate: false })
  modelRuntime.registerNativeProvider(faux.provider)
  const resolve = spyOn(models, "resolve").mockResolvedValue({ model: faux.getModel(), modelRuntime })
  cleanups.push(() => { resolve.mockRestore() })
  const factory = createPiSessionFactory({ agentDirectory: root, sessionsDirectory: root, models, observability })
  const session = await factory.open({ botId: "protocol", cwd: root, tools: tools.map((tool) => tool.name), customTools: tools, provider: "codex", model: null, effort: "medium", policy: { botId: "protocol", allowedRoot: root, mode }, ephemeral: true })
  cleanups.push(() => session.dispose())

  return { session, faux }
}

const deliveredContent = "A primeira etapa grava a entrega antes de confirmar o recebimento."

test.each(["corrige", "ignora", "silencia"])("protocolo de entrega com Fornecedor que %s", async (behavior) => {
  const messages: string[] = []
  let silenced = false
  const { session, faux } = await protocolSession(createConversationTools({ send: (content) => messages.push(content), ...(behavior === "silencia" ? { silence() { silenced = true } } : {}) }))

  const responses = [
    fauxAssistantMessage("Resposta fora da ferramenta."),
    ...(behavior !== "ignora"
      ? [fauxAssistantMessage(fauxToolCall(sendMessageTool, { content: deliveredContent }), { stopReason: "toolUse" }), fauxAssistantMessage("")]
      : [fauxAssistantMessage("Continua fora da ferramenta.")]),
  ]
  faux.setResponses(behavior === "silencia" ? [fauxAssistantMessage(fauxToolCall(finishSilentlyTool, {}), { stopReason: "toolUse" }), fauxAssistantMessage("")] : responses)
  await session.prompt({ content: "Explique a primeira etapa." })
  expect(messages).toEqual(behavior === "corrige" ? [deliveredContent] : [])
  expect(silenced).toBe(behavior === "silencia")
  expect(faux.state.callCount).toBe(behavior === "silencia" ? 2 : responses.length)
  expect(faux.getPendingResponseCount()).toBe(0)
})

test("progresso não substitui a entrega da Tarefa e report_task funciona em somente leitura", async () => {
  const messages: string[] = []
  const reports: string[] = []
  const { session, faux } = await protocolSession(createConversationTools({ send: (content) => messages.push(content), report: (report) => reports.push(report.content) }))
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall(sendMessageTool, { content: "Estou investigando" }), { stopReason: "toolUse" }),
    fauxAssistantMessage("Terminei sem entregar"),
    fauxAssistantMessage(fauxToolCall(reportTaskTool, { status: "done", content: "Causa comprovada" }), { stopReason: "toolUse" }),
    fauxAssistantMessage(""),
  ])
  await session.prompt({ content: "Investigue o cadastro" })
  expect(messages).toEqual(["Estou investigando"])
  expect(reports).toEqual(["Causa comprovada"])
  expect(faux.state.callCount).toBe(4)
})

test("uma pergunta durante o trabalho precisa de uma nova entrega", async () => {
  const messages: string[] = []
  const waiting = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const { session, faux } = await protocolSession([
    ...createConversationTools({ send: (content) => messages.push(content) }),
    {
      name: "wait_for_result",
      description: "Wait for the requested result",
      parameters: {},
      async execute() {
        waiting.resolve()
        await release.promise
        return "Result ready"
      },
    },
  ], "full")
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall(sendMessageTool, { content: "Primeiro resultado" }), { stopReason: "toolUse" }),
    fauxAssistantMessage(fauxToolCall("wait_for_result", {}), { stopReason: "toolUse" }),
    fauxAssistantMessage("Resposta nova fora da ferramenta"),
    fauxAssistantMessage(fauxToolCall(sendMessageTool, { content: "Resposta à pergunta nova" }), { stopReason: "toolUse" }),
    fauxAssistantMessage(""),
  ])
  const turn = session.prompt({ content: "Faça o trabalho" })
  await waiting.promise

  try {
    await session.steer({ content: "Como funciona?" })
  } finally {
    release.resolve()
  }

  await turn
  expect(messages).toEqual(["Primeiro resultado", "Resposta à pergunta nova"])
  expect(faux.getPendingResponseCount()).toBe(0)
})
