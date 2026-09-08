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
import { sendMessageTool } from "@src/shared/conversations"

const cleanups: (() => Promise<unknown> | void)[] = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup()
  }
})

const deliveredContent = "A primeira etapa grava a entrega antes de confirmar o recebimento."

test.each(["corrige", "ignora"])("Fornecedor que %s o lembrete recebe uma única tentativa de corrigir o envio", async (behavior) => {
  const root = await mkdtemp(join(tmpdir(), "mimo-protocol-test-"))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  const { observability } = createObservationSystem({ appSessionId: "protocol", logDirectory: join(root, "logs"), development: false })
  cleanups.push(() => observability.flush())
  const models = createPiModels()
  const faux = fauxProvider({ tokensPerSecond: 0 })
  const messages: string[] = []
  const modelRuntime = await ModelRuntime.create({ credentials: new InMemoryCredentialStore(), modelsPath: null, modelsStorePath: join(root, "models.json"), refreshOnCreate: false })
  modelRuntime.registerNativeProvider(faux.provider)
  const resolve = spyOn(models, "resolve").mockResolvedValue({ model: faux.getModel(), modelRuntime })
  cleanups.push(() => { resolve.mockRestore() })
  const tools = createConversationTools({ send: (content) => messages.push(content) })
  const factory = createPiSessionFactory({ agentDirectory: root, sessionsDirectory: root, models, observability })
  const session = await factory.open({ botId: "protocol", cwd: root, tools: tools.map((tool) => tool.name), customTools: tools, provider: "codex", model: null, effort: "medium", policy: { botId: "protocol", allowedRoot: root, mode: "read-only" }, ephemeral: true })

  cleanups.push(() => session.dispose())

  faux.setResponses([
    fauxAssistantMessage("Resposta fora da ferramenta."),
    ...(behavior === "corrige"
      ? [fauxAssistantMessage(fauxToolCall(sendMessageTool, { content: deliveredContent }), { stopReason: "toolUse" }), fauxAssistantMessage("")]
      : [fauxAssistantMessage("Continua fora da ferramenta.")]),
  ])
  await session.prompt({ content: "Explique a primeira etapa." })
  expect(messages).toEqual(behavior === "corrige" ? [deliveredContent] : [])
  expect(faux.state.callCount).toBe(behavior === "corrige" ? 3 : 2)
  expect(faux.getPendingResponseCount()).toBe(0)
})


test("progresso não substitui a entrega da Tarefa e report_task funciona em somente leitura", async () => {
  const root = await mkdtemp(join(tmpdir(), "mimo-task-protocol-"))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  const { observability } = createObservationSystem({ appSessionId: "task-protocol", logDirectory: join(root, "logs"), development: false })
  cleanups.push(() => observability.flush())
  const models = createPiModels()
  const faux = fauxProvider({ tokensPerSecond: 0 })
  const messages: string[] = []
  const reports: string[] = []
  const modelRuntime = await ModelRuntime.create({ credentials: new InMemoryCredentialStore(), modelsPath: null, modelsStorePath: join(root, "models.json"), refreshOnCreate: false })
  modelRuntime.registerNativeProvider(faux.provider)
  const resolve = spyOn(models, "resolve").mockResolvedValue({ model: faux.getModel(), modelRuntime })
  cleanups.push(() => { resolve.mockRestore() })
  const tools = createConversationTools({ send: (content) => messages.push(content), report: (report) => reports.push(report.content) })
  const factory = createPiSessionFactory({ agentDirectory: root, sessionsDirectory: root, models, observability })
  const session = await factory.open({ botId: "task-protocol", cwd: root, tools: tools.map((tool) => tool.name), customTools: tools, provider: "codex", model: null, effort: "medium", policy: { botId: "task-protocol", allowedRoot: root, mode: "read-only" }, ephemeral: true })
  cleanups.push(() => session.dispose())
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
