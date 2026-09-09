import { afterEach, expect, spyOn, test } from "bun:test"
import { InMemoryCredentialStore, fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai"
import { ModelRuntime } from "@earendil-works/pi-coding-agent"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createObservationSystem } from "@src/engine/observability/observability"
import { createPiModels } from "@src/engine/pi/pi-models"
import { createPiSessionFactory } from "@src/engine/pi/pi-session-adapter"
import type { PiRuntimeEvent } from "@src/engine/pi/pi-agent-runtime"

const cleanups: (() => Promise<unknown> | void)[] = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup()
  }
})

async function recoverySession() {
  const root = await mkdtemp(join(tmpdir(), "mimo-recovery-"))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  const { observability } = createObservationSystem({ appSessionId: "recovery", logDirectory: join(root, "logs"), development: false })
  cleanups.push(() => observability.flush())
  const models = createPiModels()
  const faux = fauxProvider({ tokensPerSecond: 0 })
  const modelRuntime = await ModelRuntime.create({ credentials: new InMemoryCredentialStore(), modelsPath: null, modelsStorePath: join(root, "models.json"), refreshOnCreate: false })
  modelRuntime.registerNativeProvider(faux.provider)
  const resolve = spyOn(models, "resolve").mockResolvedValue({ model: faux.getModel(), modelRuntime })
  cleanups.push(() => resolve.mockRestore())
  const deliveries: string[] = []
  const tool = { name: "deliver", description: "Deliver completed work", parameters: { content: "Result" }, async execute(params: Record<string, string>) { deliveries.push(params.content); return "Delivered" } }
  const factory = createPiSessionFactory({ agentDirectory: root, sessionsDirectory: root, models, observability })
  const session = await factory.open({ botId: "recovery", cwd: root, tools: [tool.name], customTools: [tool], provider: "opencode", model: null, effort: "medium", policy: { botId: "recovery", allowedRoot: root, mode: "full" }, ephemeral: true })
  cleanups.push(() => session.dispose())
  const events: PiRuntimeEvent[] = []
  const waiting = Promise.withResolvers<void>()
  session.subscribe((event) => {
    events.push(event)

    if (event.type === "provider-waiting") {
      waiting.resolve()
    }
  })

  return { session, faux, events, waiting: waiting.promise, deliveries }
}

const rateLimit = () => fauxAssistantMessage("", { stopReason: "error", errorMessage: "429 rate limit exceeded" })

test("recuperação mantém um Turno e não repete a entrega já realizada", async () => {
  const c = await recoverySession()
  c.faux.setResponses([
    fauxAssistantMessage(fauxToolCall("deliver", { content: "Etapa concluída" }), { stopReason: "toolUse" }),
    rateLimit(),
    fauxAssistantMessage("Recuperado"),
  ])
  await c.session.prompt({ content: "Execute a etapa" })
  expect(c.deliveries).toEqual(["Etapa concluída"])
  expect(c.events.filter((event) => event.type === "started")).toHaveLength(1)
  expect(c.events.filter((event) => event.type === "provider-waiting")).toMatchObject([{ attempt: 1 }])
  expect(c.events.filter((event) => event.type === "message-finished" && event.reason === "error")).toHaveLength(0)
  expect(c.events.filter((event) => event.type === "finished")).toEqual([{ type: "finished", reason: "stop" }])

  c.faux.setResponses([fauxAssistantMessage("Outro turno")])
  await c.session.prompt({ content: "Continue" })
  expect(c.events.filter((event) => event.type === "started")).toHaveLength(2)
})

test("limite do plano encerra sem retry e informa a previsão de liberação", async () => {
  const c = await recoverySession()
  c.faux.setResponses([fauxAssistantMessage("", { stopReason: "error", errorMessage: '429 {"type":"GoUsageLimitError","message":"Weekly usage limit reached. Resets in 3hr 29min. To continue, enable usage from your available balance."}' })])
  await c.session.prompt({ content: "Continue" })
  expect(c.faux.state.callCount).toBe(1)
  expect(c.events.filter((event) => event.type === "provider-waiting")).toHaveLength(0)
  expect(c.events.at(-1)).toMatchObject({ type: "finished", reason: "error", error: expect.stringContaining("Limite de uso do OpenCode Go atingido. Liberação prevista para") })
})

test("cancelar a espera impede a próxima chamada e mantém o cancelamento", async () => {
  const c = await recoverySession()
  c.faux.setResponses([rateLimit(), fauxAssistantMessage("Não deve executar")])
  const prompted = c.session.prompt({ content: "Continue" })
  await c.waiting
  await c.session.abort()
  await prompted
  expect(c.faux.state.callCount).toBe(1)
  expect(c.events.at(-1)).toEqual({ type: "finished", reason: "aborted" })
})

test("esgotar as tentativas entrega uma única falha final", async () => {
  const c = await recoverySession()
  c.faux.setResponses(Array.from({ length: 4 }, rateLimit))
  await c.session.prompt({ content: "Continue" })
  expect(c.faux.state.callCount).toBe(4)
  expect(c.events.filter((event) => event.type === "started")).toHaveLength(1)
  expect(c.events.filter((event) => event.type === "message-finished" && event.reason === "error")).toHaveLength(0)
  expect(c.events.filter((event) => event.type === "finished")).toEqual([{ type: "finished", reason: "error", error: expect.stringContaining("Você pode tentar novamente mais tarde ou trocar o modelo") }])
}, 20_000)

test("o prazo da recuperação interrompe uma nova chamada travada como falha, não como cancelamento da pessoa", async () => {
  const c = await recoverySession()
  const schedule = setTimeout
  const timer = spyOn(globalThis, "setTimeout").mockImplementation(new Proxy(schedule, {
    apply(target, receiver, args) {
      return Reflect.apply(target, receiver, [args[0], Number(args[1]) / 1000, ...args.slice(2)])
    },
  }))
  cleanups.push(() => timer.mockRestore())
  c.faux.setResponses([
    rateLimit(),
    async (_context, options) => new Promise((resolve) => {
      options?.signal?.addEventListener("abort", () => resolve(fauxAssistantMessage("", { stopReason: "aborted" })), { once: true })
    }),
  ])
  await c.session.prompt({ content: "Continue" })
  expect(c.faux.state.callCount).toBe(2)
  expect(c.events.at(-1)).toMatchObject({ type: "finished", reason: "error", error: expect.stringContaining("um minuto de recuperação") })
})
