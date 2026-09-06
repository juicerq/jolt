import { afterEach, expect, spyOn, test } from "bun:test"
import { InMemoryCredentialStore, fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai"
import { ModelRuntime } from "@earendil-works/pi-coding-agent"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createConversationTools } from "@src/engine/conversations/conversation-tools"
import { createPiModels } from "@src/engine/pi/pi-models"
import { createPiSessionFactory } from "@src/engine/pi/pi-session-adapter"
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
  const models = createPiModels()
  const faux = fauxProvider({ tokensPerSecond: 0 })
  const messages: string[] = []
  const modelRuntime = await ModelRuntime.create({ credentials: new InMemoryCredentialStore(), modelsPath: null, modelsStorePath: join(root, "models.json"), refreshOnCreate: false })
  modelRuntime.registerNativeProvider(faux.provider)
  const resolve = spyOn(models, "resolve").mockResolvedValue({ model: faux.getModel(), modelRuntime })
  cleanups.push(() => { resolve.mockRestore() })
  const tools = createConversationTools((content) => messages.push(content))
  const factory = createPiSessionFactory({ agentDirectory: root, sessionsDirectory: root, models })
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
