import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import { createBots } from "@src/engine/bots/bots"
import { createConversations } from "@src/engine/conversations/conversations"
import { createObservationSystem } from "@src/engine/observability/observability"
import { createPiAgentRuntime, type PiCustomTool, type PiRuntimeEvent, type PiSessionFactory } from "@src/engine/pi/pi-agent-runtime"
import { openDatabase } from "@src/engine/persistence/database"
import { createTasks } from "@src/engine/tasks/tasks"
import { testDirectory } from "../../support/test-directory"

const directory = testDirectory("jolt-delegation-")
const botFunction = { outcome: "Answer", responsibilities: "Help", limits: "Be safe", delivery: "Text" }

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
          const script = scripts.get(input.botId)

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

            emit({ type: "tool-started", callId, tool, detail: params.outcome ?? params.member })
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
  const bots = createBots({ database, observability: observationSystem.observability, privateBotsDirectory: join(directory, "bots"), providers })
  const tasks = createTasks({ database, observability: observationSystem.observability })
  const runtime = createPiAgentRuntime(sessionFactory, observationSystem.observability)
  const conversations = createConversations({ database, bots, tasks, runtime, observability: observationSystem.observability })

  async function team() {
    const leader = await bots.create({ name: "Atlas", provider: "codex", function: botFunction })
    const member = database.bots.create({ id: crypto.randomUUID(), leaderBotId: leader.id, projectId: null, name: "Calo", provider: "codex", function: botFunction, workingDirectoryOverride: null, createdAt: new Date().toISOString() })
    const other = database.bots.create({ id: crypto.randomUUID(), leaderBotId: leader.id, projectId: null, name: "Dara", provider: "codex", function: botFunction, workingDirectoryOverride: null, createdAt: new Date().toISOString() })

    return { leader, member, other }
  }

  async function collect(stream: AsyncIterable<{ type: string }>) {
    const events = []

    for await (const event of stream) {
      events.push(event)
    }

    return events
  }

  async function close() {
    conversations.dispose()
    database.close()
    await observationSystem.observability.flush()
  }

  return { bots, close, collect, conversations, observationSystem, scripts, sessions, tasks, team }
}

describe("delegation", () => {
  test("a Leader delegates a Tarefa to a member and receives the reply in a visible conversation", async () => {
    const environment = setup()
    const { leader, member } = await environment.team()
    environment.scripts.set(leader.id, async (_message, call) => `Calo respondeu: ${await call("delegate", { member: "Calo", outcome: "Escrever testes", instructions: "Cubra o módulo de tarefas" })}`)
    environment.scripts.set(member.id, async () => "Testes escritos")

    const events = await environment.collect(environment.conversations.send({ botId: leader.id, content: "Delegue os testes" }))

    expect(events.map((event) => event.type)).toEqual(["started", "tool-started", "tool-finished", "text", "finished"])
    expect(environment.sessions.get(leader.id)?.tools).toContain("delegate")
    expect(environment.sessions.get(leader.id)?.instructions).toContain("Calo")
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
      { type: "tool", name: "delegate", tools: [{ callId: expect.any(String), name: "delegate", detail: "Escrever testes", status: "done" }] },
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

    const leaderEvents = environment.collect(environment.conversations.send({ botId: leader.id, content: "Delegue a revisão" }))
    await started
    const personEvents = await environment.collect(environment.conversations.send({ botId: member.id, content: "Pare e responda só isto" }))
    await leaderEvents

    expect(personEvents.map((event) => event.type)).toEqual(["started", "text", "finished"])
    const [task] = environment.tasks.listForLeader({ leaderBotId: leader.id })

    expect(task?.status).toBe("interrupted")
    expect(environment.conversations.history({ botId: leader.id }).at(-1)?.content).toContain("direct order")
    expect(environment.conversations.history({ botId: member.id }).map(({ author, taskId, content }) => ({ author, taskId, content }))).toEqual([
      { author: "bot", taskId: task?.id, content: "Revisar código\n\nLeia tudo" },
      { author: "person", taskId: task?.id, content: "Pare e responda só isto" },
      { author: "bot", taskId: task?.id, content: "Respondi à pessoa" },
    ])
    await environment.close()
  })

  test("a member transfers the Tarefa to another member with a visible message", async () => {
    const environment = setup()
    const { leader, member, other } = await environment.team()
    environment.scripts.set(leader.id, async (_message, call) => await call("delegate", { member: "Calo", outcome: "Desenhar a tela", instructions: "Use o DESIGN.md" }))
    environment.scripts.set(member.id, async (_message, call) => `Dara assumiu: ${await call("transfer", { member: "Dara", instructions: "Você conhece o DESIGN.md melhor" })}`)
    environment.scripts.set(other.id, async () => "Tela desenhada")

    await environment.collect(environment.conversations.send({ botId: leader.id, content: "Delegue a tela" }))

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

  test("delegating to a busy member or a stranger fails without creating a Tarefa", async () => {
    const environment = setup()
    const { leader, member } = await environment.team()
    const stranger = await environment.bots.create({ name: "Zeta", provider: "codex", function: botFunction })
    environment.scripts.set(leader.id, async (_message, call) => `${await call("delegate", { member: stranger.id, outcome: "x", instructions: "y" })} | ${await call("delegate", { member: "Calo", outcome: "x", instructions: "y" })}`)

    const memberStream = environment.conversations.send({ botId: member.id, content: "Trabalhe" })[Symbol.asyncIterator]()
    await memberStream.next()
    await environment.collect(environment.conversations.send({ botId: leader.id, content: "Delegue" }))

    expect(environment.conversations.history({ botId: leader.id }).at(-1)?.content).toBe("Error: Zeta is not a member of Atlas | Error: Calo is already working")
    expect(environment.tasks.listForLeader({ leaderBotId: leader.id })).toEqual([])
    await environment.conversations.abort({ botId: member.id })
    await memberStream.next()
    await environment.close()
  })
})
