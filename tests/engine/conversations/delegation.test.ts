import { describe, expect, test } from "bun:test"
import type { ConversationEvent } from "@src/shared/conversations"
import { join } from "node:path"
import { createBots } from "@src/engine/bots/bots"
import { createConversations } from "@src/engine/conversations/conversations"
import { createObservationSystem } from "@src/engine/observability/observability"
import { createPiAgentRuntime, type PiCustomTool, type PiRuntimeEvent, type PiSessionFactory } from "@src/engine/pi/pi-agent-runtime"
import { openDatabase } from "@src/engine/persistence/database"
import { createRoutines } from "@src/engine/routines/routines"
import { createTasks } from "@src/engine/tasks/tasks"
import { testDirectory } from "../../support/test-directory"

const directory = testDirectory("jolt-delegation-")
const botFunction = { outcome: "Answer", description: "Help" }

type Script = (message: string, call: (tool: string, params: Record<string, string>) => Promise<string>) => Promise<string>

function setup() {
  const scripts = new Map<string, Script>()
  const sessions = new Map<string, { tools: string[]; customTools: PiCustomTool[]; instructions: string }>()
  const sessionFactory: PiSessionFactory = {
    async open(input) {
      const listeners = new Set<(event: PiRuntimeEvent) => void>()
      const emit = (event: PiRuntimeEvent) => {
        for (const listener of listeners) {
          listener(event)
        }
      }
      let aborted = false
      let pending: (() => void) | undefined
      sessions.set(input.botId, { tools: input.tools, customTools: input.customTools ?? [], instructions: input.instructions ?? "" })

      return {
        sessionFile: join(directory, `${input.botId}.jsonl`),
        async prompt(message) {
          aborted = false
          emit({ type: "started" })
          const script = scripts.get(input.botId) ?? scripts.get("*")

          if (!script) {
            await new Promise<void>((resolve) => {
              pending = resolve
            })

            return
          }

          const reply = await script(message, async (tool, params) => {
            const callId = crypto.randomUUID()
            const definition = input.customTools?.find((candidate) => candidate.name === tool)

            if (!definition) {
              throw new Error(`Tool ${tool} is not registered`)
            }

            const detail = params.member ?? params.name
            emit({ type: "tool-started", callId, tool, ...(detail ? { detail } : {}), ...(params.outcome ? { brief: params.outcome } : {}) })
            const result = await definition.execute(params).catch((error: Error) => `Error: ${error.message}`)
            emit({ type: "tool-finished", callId, tool, failed: result.startsWith("Error:") })

            return result
          })

          if (aborted) {
            return
          }

          emit({ type: "text", text: reply })
          emit({ type: "finished", reason: "stop" })
        },
        async abort() {
          aborted = true
          emit({ type: "finished", reason: "aborted" })
          pending?.()
        },
        setTools() {},
        subscribe(listener) {
          listeners.add(listener)

          return () => listeners.delete(listener)
        },
        dispose() {},
      }
    },
  }
  const observationSystem = createObservationSystem({ appSessionId: crypto.randomUUID(), logDirectory: join(directory, "logs"), development: false })
  const database = openDatabase(join(directory, `${crypto.randomUUID()}.sqlite`), observationSystem.observability)
  const providers = { list: async () => [{ provider: "codex" as const, status: "available" as const }] }
  const bots = createBots({ database, observability: observationSystem.observability, privateBotsDirectory: join(directory, "bots"), providers, conversations: { close: (botId) => conversations.close(botId) } })
  const tasks = createTasks({ database, observability: observationSystem.observability })
  const runtime = createPiAgentRuntime(sessionFactory, observationSystem.observability)
  const conversations = createConversations({ database, bots, tasks, runtime, observability: observationSystem.observability, extensions: [{ tools: (bot) => routines.tools(bot), instructions: (bot) => routines.instructions(bot) }] })
  const routines = createRoutines({ database, bots, observability: observationSystem.observability, conversations: { call: (botId, content) => conversations.call(botId, content) } })

  async function team() {
    const leader = await bots.create({ name: "Atlas", provider: "codex", function: botFunction })
    const member = database.bots.create({ id: crypto.randomUUID(), leaderBotId: leader.id, projectId: null, name: "Calo", provider: "codex", function: { ...botFunction, outcome: "Testes cobertos" }, workingDirectoryOverride: null, temporary: false, memoryEnabled: true, effort: "medium", model: null, createdAt: new Date().toISOString() })
    const other = database.bots.create({ id: crypto.randomUUID(), leaderBotId: leader.id, projectId: null, name: "Dara", provider: "codex", function: { ...botFunction, outcome: "Telas desenhadas" }, workingDirectoryOverride: null, temporary: false, memoryEnabled: true, effort: "medium", model: null, createdAt: new Date().toISOString() })

    return { leader, member, other }
  }

  async function turn(botId: string, content: string) {
    const events = conversations.events()[Symbol.asyncIterator]()
    await conversations.send({ botId, content, images: [] })
    const collected: ConversationEvent[] = []

    for (let step = await events.next(); step.value; step = await events.next()) {
      const { event } = step.value
      const ownStart = event.type === "started" && event.message.content === content
      const skipped = step.value.botId !== botId || (collected.length === 0 && !ownStart)

      if (skipped) {
        continue
      }

      collected.push(event)

      if (step.value.event.type === "finished") {
        break
      }
    }

    await events.return?.(undefined)

    return collected
  }

  async function close() {
    routines.dispose()
    conversations.dispose()
    database.close()
    await observationSystem.observability.flush()
  }

  return { bots, close, conversations, database, observationSystem, scripts, sessions, tasks, team, turn }
}

describe("delegation", () => {
  test("a Leader delegates a Tarefa to a member and receives the reply in a visible conversation", async () => {
    const environment = setup()
    const { leader, member } = await environment.team()
    environment.scripts.set(leader.id, async (_message, call) => `Calo respondeu: ${await call("delegate", { member: "Calo", outcome: "Escrever testes", instructions: "Cubra o módulo de tarefas" })}`)
    environment.scripts.set(member.id, async () => "Testes escritos")

    const events = await environment.turn(leader.id, "Delegue os testes")

    expect(events.map((event) => event.type)).toEqual(["started", "tool-started", "tool-finished", "text", "finished"])
    expect(environment.sessions.get(leader.id)?.instructions).toContain("- Calo: Testes cobertos")
    expect(environment.sessions.get(leader.id)?.instructions).toContain("- Dara: Telas desenhadas")
    expect(environment.sessions.get(member.id)?.tools).toContain("transfer")
    expect(environment.sessions.get(member.id)?.instructions).toContain("Atlas")
    const [task] = environment.tasks.listForLeader({ leaderBotId: leader.id })

    expect(task).toMatchObject({ leaderBotId: leader.id, assigneeBotId: member.id, outcome: "Escrever testes", status: "done" })
    expect(task?.finishedAt).not.toBeNull()
    expect(environment.conversations.history({ botId: leader.id }).map(({ author, authorBotId, taskId, content }) => ({ author, authorBotId, taskId, content }))).toEqual([
      { author: "person", authorBotId: null, taskId: null, content: "Delegue os testes" },
      { author: "bot", authorBotId: leader.id, taskId: null, content: "Calo respondeu: Testes escritos" },
    ])
    expect(environment.conversations.history({ botId: leader.id }).at(-1)?.activity?.steps).toEqual([
      { type: "tool", name: "delegate", tools: [{ callId: expect.any(String), name: "delegate", detail: "Calo", brief: "Escrever testes", status: "done" }] },
    ])
    const memberHistory = environment.conversations.history({ botId: member.id }).map(({ author, authorBotId, taskId, content }) => ({ author, authorBotId, taskId, content }))

    expect(memberHistory).toEqual([
      { author: "bot", authorBotId: leader.id, taskId: task?.id, content: "Escrever testes\n\nCubra o módulo de tarefas" },
      { author: "bot", authorBotId: member.id, taskId: task?.id, content: "Testes escritos" },
    ])
    expect(environment.conversations.related({ taskId: task?.id }).map(({ authorBotId, content }) => ({ authorBotId, content }))).toEqual([
      { authorBotId: leader.id, content: "Escrever testes\n\nCubra o módulo de tarefas" },
      { authorBotId: member.id, content: "Testes escritos" },
    ])
    await environment.observationSystem.observability.flush()
    const observations = environment.observationSystem.diagnostics.recent()
    const leaderTurn = observations.find((item) => item.name === "pi.turn" && item.botId === leader.id)
    const memberStart = observations.find((item) => item.name === "conversation.started" && item.botId === member.id)

    expect(leaderTurn?.traceId).toBeDefined()
    expect(memberStart).toMatchObject({ traceId: leaderTurn?.traceId, leaderBotId: leader.id, taskId: task?.id })
    expect(JSON.stringify(observations)).not.toContain("Escrever testes")
    await environment.close()
  })

  test("a direct order from the person interrupts the delegation and the Leader learns about it", async () => {
    const environment = setup()
    const { leader, member } = await environment.team()
    let delegationStarted: (() => void) | undefined
    const started = new Promise<void>((resolve) => {
      delegationStarted = resolve
    })
    environment.scripts.set(leader.id, async (_message, call) => `Resultado: ${await call("delegate", { member: member.id, outcome: "Revisar código", instructions: "Leia tudo" })}`)
    environment.scripts.set(member.id, async (message) => {
      if (message === "Pare e responda só isto") {
        return "Respondi à pessoa"
      }

      delegationStarted?.()
      await new Promise<void>((resolve) => setTimeout(resolve, 5_000).unref())

      return "nunca"
    })

    const leaderEvents = environment.turn(leader.id, "Delegue a revisão")
    await started
    const personEvents = await environment.turn(member.id, "Pare e responda só isto")
    await leaderEvents

    expect(personEvents.map((event) => event.type)).toEqual(["started", "text", "finished"])
    const [task] = environment.tasks.listForLeader({ leaderBotId: leader.id })

    expect(task?.status).toBe("interrupted")
    expect(environment.conversations.history({ botId: leader.id }).at(-1)?.content).toContain("direct order")
    expect(environment.conversations.history({ botId: member.id }).map(({ author, taskId, content, ending }) => ({ author, taskId, content, ending }))).toEqual([
      { author: "bot", taskId: task?.id, content: "Revisar código\n\nLeia tudo", ending: null },
      { author: "bot", taskId: task?.id, content: "", ending: "aborted" },
      { author: "person", taskId: task?.id, content: "Pare e responda só isto", ending: null },
      { author: "bot", taskId: task?.id, content: "Respondi à pessoa", ending: null },
    ])
    await environment.close()
  })

  test("a member transfers the Tarefa to another member with a visible message", async () => {
    const environment = setup()
    const { leader, member, other } = await environment.team()
    environment.scripts.set(leader.id, async (_message, call) => await call("delegate", { member: "Calo", outcome: "Desenhar a tela", instructions: "Use o DESIGN.md" }))
    environment.scripts.set(member.id, async (_message, call) => `Dara assumiu: ${await call("transfer", { member: "Dara", instructions: "Você conhece o DESIGN.md melhor" })}`)
    environment.scripts.set(other.id, async () => "Tela desenhada")

    await environment.turn(leader.id, "Delegue a tela")

    const [task] = environment.tasks.listForLeader({ leaderBotId: leader.id })

    expect(task).toMatchObject({ assigneeBotId: other.id, status: "done" })
    expect(environment.conversations.history({ botId: other.id }).map(({ authorBotId, taskId, content }) => ({ authorBotId, taskId, content }))).toEqual([
      { authorBotId: member.id, taskId: task?.id, content: "Você conhece o DESIGN.md melhor" },
      { authorBotId: other.id, taskId: task?.id, content: "Tela desenhada" },
    ])
    expect(environment.conversations.related({ taskId: task?.id }).map((message) => message.botId)).toEqual([member.id, other.id, other.id, member.id])
    expect(environment.conversations.history({ botId: leader.id }).at(-1)?.content).toBe("Dara assumiu: Tela desenhada")
    await environment.close()
  })

  test("a member that fails before finishing marks the delegation as failed", async () => {
    const environment = setup()
    const { leader, member } = await environment.team()
    environment.scripts.set(leader.id, async (_message, call) => `Resultado: ${await call("delegate", { member: "Calo", outcome: "Rodar os testes", instructions: "Rode tudo" })}`)
    environment.scripts.set(member.id, async () => {
      throw new Error("Provider crashed")
    })

    const events = await environment.turn(leader.id, "Delegue")

    expect(events).toContainEqual(expect.objectContaining({ type: "tool-finished", tool: "delegate", failed: true }))
    expect(environment.tasks.listForLeader({ leaderBotId: leader.id })[0]?.status).toBe("failed")
    expect(environment.conversations.history({ botId: leader.id }).at(-1)?.activity?.steps).toEqual([
      { type: "tool", name: "delegate", tools: [{ callId: expect.any(String), name: "delegate", detail: "Calo", brief: "Rodar os testes", status: "failed" }] },
    ])
    expect(environment.conversations.history({ botId: leader.id }).at(-1)?.content).toBe("Resultado: Error: Calo failed before finishing.")
    await environment.close()
  })

  test("delegating to a busy member or a stranger fails without creating a Tarefa", async () => {
    const environment = setup()
    const { leader, member } = await environment.team()
    const stranger = await environment.bots.create({ name: "Zeta", provider: "codex", function: botFunction })
    environment.scripts.set(leader.id, async (_message, call) => `${await call("delegate", { member: stranger.id, outcome: "x", instructions: "y" })} | ${await call("delegate", { member: "Calo", outcome: "x", instructions: "y" })}`)

    await environment.conversations.send({ botId: member.id, content: "Trabalhe", images: [] })
    await environment.turn(leader.id, "Delegue")

    expect(environment.conversations.history({ botId: leader.id }).at(-1)?.content).toBe("Error: Zeta is not a member of Atlas | Error: Calo is already working")
    expect(environment.tasks.listForLeader({ leaderBotId: leader.id })).toEqual([])
    await environment.conversations.abort({ botId: member.id })
    await environment.close()
  })

  test("a Leader that gains a member after its first turn opens the next turn with the member", async () => {
    const environment = setup()
    const leader = await environment.bots.create({ name: "Atlas", provider: "codex", function: botFunction })
    environment.scripts.set(leader.id, async () => "Oi")

    await environment.turn(leader.id, "Oi")

    expect(environment.sessions.get(leader.id)?.instructions).not.toContain("- Calo")
    environment.database.bots.create({ id: crypto.randomUUID(), leaderBotId: leader.id, projectId: null, name: "Calo", provider: "codex", function: { ...botFunction, outcome: "Testes cobertos" }, workingDirectoryOverride: null, temporary: false, memoryEnabled: true, effort: "medium", model: null, createdAt: new Date().toISOString() })

    await environment.turn(leader.id, "Delegue")

    expect(environment.sessions.get(leader.id)?.instructions).toContain("- Calo: Testes cobertos")
    await environment.close()
  })

  test("a Leader that delegates without waiting keeps working and later receives each reply as a message", async () => {
    const environment = setup()
    const { leader, member, other } = await environment.team()
    environment.scripts.set(leader.id, async (message, call) => {
      if (message !== "Delegue") {
        return `Recebi: ${message}`
      }

      const first = await call("delegate", { member: "Calo", outcome: "Escrever testes", instructions: "Cubra tudo", wait: "no" })
      const second = await call("delegate", { member: "Dara", outcome: "Desenhar a tela", instructions: "Use o DESIGN.md", wait: "no" })

      return `${first} ${second}`
    })
    environment.scripts.set(member.id, async () => "Testes escritos")
    environment.scripts.set(other.id, async () => "Tela desenhada")

    const events = await environment.turn(leader.id, "Delegue")

    expect(events.map((event) => event.type)).toEqual(["started", "tool-started", "tool-finished", "tool-started", "tool-finished", "text", "finished"])
    expect(environment.conversations.history({ botId: leader.id }).at(-1)?.content).toContain("Calo")

    for (let attempt = 0; attempt < 200 && environment.conversations.history({ botId: leader.id }).length < 6; attempt++) {
      await new Promise<void>((resolve) => setTimeout(resolve, 10))
    }

    const tasks = environment.tasks.listForLeader({ leaderBotId: leader.id })
    const history = environment.conversations.history({ botId: leader.id }).map(({ author, authorBotId, taskId, content }) => ({ author, authorBotId, taskId, content }))

    expect(tasks.map((task) => task.status)).toEqual(["done", "done"])
    expect(history).toContainEqual({ author: "bot", authorBotId: member.id, taskId: tasks[0]?.id, content: "Testes escritos" })
    expect(history).toContainEqual({ author: "bot", authorBotId: leader.id, taskId: tasks[0]?.id, content: "Recebi: Testes escritos" })
    expect(history).toContainEqual({ author: "bot", authorBotId: other.id, taskId: tasks[1]?.id, content: "Tela desenhada" })
    expect(history).toContainEqual({ author: "bot", authorBotId: leader.id, taskId: tasks[1]?.id, content: "Recebi: Tela desenhada" })
    expect(history).toHaveLength(6)
    await environment.close()
  })

  test("a Leader without a team hires a permanent member and delegates to it in the same turn", async () => {
    const environment = setup()
    const leader = await environment.bots.create({ name: "Atlas", provider: "codex", function: botFunction })
    environment.scripts.set(leader.id, async (message, call) => {
      if (message === "Peça a segunda revisão") {
        return `Segunda: ${await call("delegate", { member: "Revisor", outcome: "Segunda revisão", instructions: "Revise de novo" })}`
      }

      const first = await call("hire", { name: "Revisor", role: "Revisão de código", permanent: "yes", outcome: "Primeira revisão", instructions: "Leia tudo" })

      return `Primeira: ${first}. Mesma volta: ${await call("delegate", { member: "Revisor", outcome: "Revisão extra", instructions: "Confira o resto" })}`
    })
    environment.scripts.set("*", async (message) => `Feito: ${message.split("\n")[0]}`)

    await environment.turn(leader.id, "Contrate um revisor fixo")
    const hired = environment.bots.list().find((bot) => bot.name === "Revisor")

    expect(hired).toMatchObject({ leaderBotId: leader.id, temporary: false, closed: false, function: { outcome: "Revisão de código" } })
    expect(hired?.function).not.toHaveProperty("description")
    expect(environment.conversations.history({ botId: leader.id }).at(-1)?.content).toBe("Primeira: Feito: Primeira revisão. Mesma volta: Feito: Revisão extra")
    await environment.turn(leader.id, "Peça a segunda revisão")

    expect(environment.conversations.history({ botId: leader.id }).at(-1)?.content).toBe("Segunda: Feito: Segunda revisão")
    expect(environment.sessions.get(leader.id)?.instructions).toContain("- Revisor: Revisão de código")
    expect(environment.tasks.listForLeader({ leaderBotId: leader.id }).map((task) => task.status)).toEqual(["done", "done", "done"])
    await environment.close()
  })

  test("a Leader hires a temporary member for one Tarefa and the member closes with it", async () => {
    const environment = setup()
    const { leader } = await environment.team()
    const hireParams = { name: "Revisor", role: "Revisão de código", description: "Revisar arquivos", permanent: "no", outcome: "Revisão pronta", instructions: "Leia os 5 arquivos" }
    environment.scripts.set(leader.id, async (message, call) => {
      if (message === "Delegue de novo") {
        return `Falhou: ${await call("delegate", { member: "Revisor", outcome: "Outra", instructions: "Mais" })}`
      }

      return `Revisor respondeu: ${await call("hire", hireParams)}`
    })
    environment.scripts.set("*", async () => "Três achados")

    await environment.turn(leader.id, "Contrate um revisor")
    const hired = environment.bots.list().find((bot) => bot.name === "Revisor")
    const [task] = environment.tasks.listForLeader({ leaderBotId: leader.id })

    expect(hired).toMatchObject({ leaderBotId: leader.id, temporary: true, closed: true, provider: "codex", function: { outcome: "Revisão de código", description: "Revisar arquivos" } })
    expect(task).toMatchObject({ assigneeBotId: hired?.id, outcome: "Revisão pronta", status: "done" })
    expect(environment.sessions.get(hired?.id ?? "")?.customTools.map((tool) => tool.name)).toEqual(["transfer"])
    expect(environment.sessions.get(leader.id)?.instructions).not.toContain("Revisor")
    expect(environment.conversations.history({ botId: leader.id }).at(-1)?.content).toBe("Revisor respondeu: Três achados")
    expect(environment.conversations.history({ botId: hired?.id ?? "" }).map(({ taskId, content }) => ({ taskId, content }))).toEqual([
      { taskId: task?.id, content: "Revisão pronta\n\nLeia os 5 arquivos" },
      { taskId: task?.id, content: "Três achados" },
    ])
    expect(() => environment.conversations.send({ botId: hired?.id ?? "", content: "Mais um", images: [] })).toThrow("Revisor was closed with its Tarefa")
    await environment.turn(leader.id, "Delegue de novo")

    expect(environment.conversations.history({ botId: leader.id }).at(-1)?.content).toBe("Falhou: Error: Revisor is not a member of Atlas")
    expect(environment.tasks.listForLeader({ leaderBotId: leader.id })).toHaveLength(1)
    await environment.close()
  })
})
