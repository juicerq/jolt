import { beforeEach, describe, expect, setSystemTime, test } from "bun:test"
import { join } from "node:path"
import { createBots } from "@src/engine/bots/bots"
import { createConversations } from "@src/engine/conversations/conversations"
import { createObservationSystem } from "@src/engine/observability/observability"
import { createPiAgentRuntime, type PiRuntimeEvent, type PiSessionFactory, type PiTool } from "@src/engine/pi/pi-agent-runtime"
import { openDatabase } from "@src/engine/persistence/database"
import { createRoutines, nextCall } from "@src/engine/routines/routines"
import { createTasks } from "@src/engine/tasks/tasks"
import { testDirectory } from "../../support/test-directory"

const directory = testDirectory("jolt-routines-")
const minute = 60_000
const hour = 60 * minute
const day = 24 * hour
const weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const
const everyThirtyMinutes = { form: "interval" as const, everyMinutes: 30, days: [...weekdays], startTime: "00:00", endTime: "23:59" }

function setup() {
  const prompts: unknown[] = []
  const tools = new Map<string, PiTool[]>()
  const listeners = new Set<(event: PiRuntimeEvent) => void>()
  let holdPrompt = false
  let releasePrompt = () => {}
  const sessionFactory: PiSessionFactory = {
    async open(input) {
      tools.set(input.botId, input.customTools ?? [])

      return {
        compact: async () => ({ tokensBefore: 0 }),
        async prompt(message) {
          prompts.push(message)

          for (const listener of listeners) {
            listener({ type: "started" })
            listener({ type: "text", text: "Nada novo." })
          }

          if (holdPrompt) {
            await new Promise<void>((resolve) => {
              releasePrompt = resolve
            })
          }

          for (const listener of listeners) {
            listener({ type: "finished", reason: "stop" })
          }
        },
        async abort() {
          releasePrompt()
        },
        subscribe(listener) {
          listeners.add(listener)

          return () => listeners.delete(listener)
        },
        dispose() {},
      }
    },
  }
  const system = createObservationSystem({ appSessionId: crypto.randomUUID(), logDirectory: join(directory, "logs"), development: false })
  const database = openDatabase(join(directory, `${crypto.randomUUID()}.sqlite`), system.observability)
  const providers = { list: async () => [{ provider: "codex" as const, status: "available" as const }] }
  const bots = createBots({ database, observability: system.observability, privateBotsDirectory: join(directory, "bots"), providers, conversations: { close: (botId) => conversations.close(botId) } })
  const runtime = createPiAgentRuntime(sessionFactory, system.observability)
  const tasks = createTasks({ database, observability: system.observability })
  const conversations = createConversations({ database, bots, tasks, runtime, observability: system.observability, extensions: [{ tools: (bot) => routines.tools(bot), instructions: (bot) => routines.instructions(bot) }] })
  let routines = createRoutines({ database, bots, observability: system.observability, conversations: { call: (routine) => conversations.call(routine) } })

  function restart() {
    routines.dispose()
    routines = createRoutines({ database, bots, observability: system.observability, conversations: { call: (routine) => conversations.call(routine) } })

    return routines
  }

  async function settled(botId: string) {
    for await (const event of conversations.events()) {
      if (event.botId === botId && event.event.type === "finished") {
        return
      }
    }
  }

  async function close() {
    routines.dispose()
    conversations.dispose()
    database.close()
    await system.observability.flush()
  }

  return {
    bots,
    close,
    conversations,
    database,
    prompts,
    restart,
    settled,
    tools,
    get routines() {
      return routines
    },
    holdPrompts() {
      holdPrompt = true
    },
  }
}

async function createBot(environment: ReturnType<typeof setup>) {
  return environment.bots.create({ name: "Correio", provider: "codex", function: { outcome: "Avisar sobre e-mails que precisam de resposta" } })
}

describe("routines", () => {
  beforeEach(() => {
    setSystemTime()
  })

  test("Chamadas missed while the Jolt was closed are skipped and the Rotina moves to the next Frequência", async () => {
    const environment = setup()
    const bot = await createBot(environment)
    const created = new Date()
    setSystemTime(created)
    const routine = environment.routines.create({ botId: bot.id, name: "Verificar entrada", content: "Verifique a caixa de entrada", frequency: everyThirtyMinutes })

    expect(routine.nextCallAt).toBe(nextCall(everyThirtyMinutes, created).toISOString())

    const reopened = new Date(created.getTime() + 3 * hour)
    setSystemTime(reopened)
    const routines = environment.restart()
    await Bun.sleep(50)

    const history = environment.conversations.history({ botId: bot.id, limit: 100 }).messages

    expect(history).toEqual([])
    expect(environment.prompts).toEqual([])
    expect(routines.list({ botId: bot.id })[0]?.nextCallAt).toBe(nextCall(everyThirtyMinutes, reopened).toISOString())
    await environment.close()
  })

  test("a Bot that is already working skips the Chamada", async () => {
    const environment = setup()
    const bot = await createBot(environment)
    environment.routines.create({ botId: bot.id, name: "Verificar entrada", content: "Verifique a caixa de entrada", frequency: everyThirtyMinutes })
    environment.holdPrompts()
    await environment.conversations.send({ botId: bot.id, content: "Revise o relatório", images: [] })

    const reopened = new Date(Date.now() + hour)
    setSystemTime(reopened)
    const routines = environment.restart()
    await Bun.sleep(50)

    expect(environment.prompts).toEqual([expect.objectContaining({ content: "Revise o relatório" })])
    expect(routines.list({ botId: bot.id })[0]?.nextCallAt).toBe(nextCall(everyThirtyMinutes, reopened).toISOString())
    await environment.conversations.abort({ botId: bot.id })
    await environment.close()
  })

  test("a paused Rotina does not call its Bot", async () => {
    const environment = setup()
    const bot = await createBot(environment)
    const routine = environment.routines.create({ botId: bot.id, name: "Verificar entrada", content: "Verifique a caixa de entrada", frequency: everyThirtyMinutes })
    environment.routines.update({ id: routine.id, name: routine.name, content: routine.content, frequency: routine.frequency, status: "paused" })

    setSystemTime(new Date(Date.now() + hour))
    environment.restart()
    await Bun.sleep(50)

    expect(environment.prompts).toEqual([])
    await environment.close()
  })

  test("a fixed-time Frequência lands on the chosen weekday and local hour", async () => {
    const environment = setup()
    const bot = await createBot(environment)
    const wednesday = new Date()
    wednesday.setDate(wednesday.getDate() + ((3 - wednesday.getDay() + 7) % 7 || 7))
    wednesday.setHours(10, 0, 0, 0)
    setSystemTime(wednesday)

    const routine = environment.routines.create({ botId: bot.id, name: "Resumo semanal", content: "Resumo da semana", frequency: { form: "fixed-time", days: ["monday", "wednesday"], times: ["09:00"] } })
    const nextScheduledCall = new Date(routine.nextCallAt ?? "")

    expect(nextScheduledCall.getDay()).toBe(1)
    expect([nextScheduledCall.getHours(), nextScheduledCall.getMinutes()]).toEqual([9, 0])
    expect(nextScheduledCall.getTime() - wednesday.getTime()).toBe(5 * day - hour)
    await environment.close()
  })

  test("the Bot edits its own Rotinas through the routine tools", async () => {
    const environment = setup()
    const bot = await createBot(environment)
    await environment.conversations.send({ botId: bot.id, content: "Olá", images: [] })
    const botTools = environment.tools.get(bot.id) ?? []
    const routineTool = botTools.find((tool) => tool.name === "routine")
    const removeTool = botTools.find((tool) => tool.name === "remove_routine")

    await routineTool?.execute({ name: "Verificar entrada", content: "Verifique a caixa de entrada", everyMinutes: "45", days: "monday, tuesday, wednesday, thursday, friday", startTime: "08:00", endTime: "17:00" })
    const [created] = environment.routines.list({ botId: bot.id })

    expect(created).toMatchObject({ name: "Verificar entrada", content: "Verifique a caixa de entrada", frequency: { form: "interval", everyMinutes: 45 }, status: "active" })

    await routineTool?.execute({ id: created?.id ?? "", name: "Resumo semanal", content: "Resumo da semana", days: "monday, friday", times: "09:00" })

    expect(environment.routines.list({ botId: bot.id })[0]).toMatchObject({ name: "Resumo semanal", content: "Resumo da semana", frequency: { form: "fixed-time", days: ["monday", "friday"], times: ["09:00"] } })

    await removeTool?.execute({ id: created?.id ?? "" })

    expect(environment.routines.list({ botId: bot.id })).toEqual([])
    await environment.close()
  })

  test("a Rotina de uma vez calls its Bot once and remains completed", async () => {
    const environment = setup()
    const bot = await createBot(environment)
    const created = new Date()
    setSystemTime(created)
    const at = new Date(created.getTime() + 50).toISOString()
    const routine = environment.routines.create({ botId: bot.id, name: "Tomar café", content: "Lembre o usuário: tomar café", frequency: { form: "once", at } })

    expect(routine.nextCallAt).toBe(at)

    setSystemTime()
    await environment.settled(bot.id)

    expect(environment.prompts).toEqual([expect.objectContaining({
      content: "Lembre o usuário: tomar café",
      context: expect.objectContaining({ cause: "routine", routineId: routine.id, scheduledFor: at }),
    })])
    expect(environment.routines.list({ botId: bot.id })[0]).toMatchObject({ id: routine.id, status: "completed", nextCallAt: null })
    await environment.close()
  })

  test("a Rotina de uma vez cannot be set in the past", async () => {
    const environment = setup()
    const bot = await createBot(environment)
    const at = new Date(Date.now() - minute).toISOString()

    expect(() => environment.routines.create({ botId: bot.id, name: "Tarde demais", content: "Tarde demais", frequency: { form: "once", at } })).toThrow("That time has passed")
    await environment.close()
  })

  test("the Bot sets a Rotina de uma vez in minutes or at a local time", async () => {
    const environment = setup()
    const bot = await createBot(environment)
    const now = new Date()
    now.setHours(10, 0, 0, 0)
    setSystemTime(now)
    await environment.conversations.send({ botId: bot.id, content: "Olá", images: [] })
    const routineTool = environment.tools.get(bot.id)?.find((tool) => tool.name === "routine")

    await routineTool?.execute({ name: "Café", content: "Tomar café", inMinutes: "5" })
    await routineTool?.execute({ name: "Almoço", content: "Almoço", at: "12:30" })
    await routineTool?.execute({ name: "Bom dia", content: "Bom dia", at: "09:00" })

    const ats = environment.routines.list({ botId: bot.id }).map((routine) => routine.frequency.form === "once" ? Date.parse(routine.frequency.at) - now.getTime() : undefined)

    expect(ats).toEqual([5 * minute, 2.5 * hour, day - hour])
    await expect(routineTool?.execute({ name: "Errado", content: "Errado", at: "amanhã" })).rejects.toThrow('Give at as "HH:MM" or "YYYY-MM-DD HH:MM"')
    await environment.close()
  })

  test("a temporary Integrante cannot have a Rotina", async () => {
    const environment = setup()
    const leader = await createBot(environment)
    const member = await environment.bots.hire(leader, { name: "Apoio", permanent: false, function: { outcome: "Ajudar" } })

    expect(() => environment.routines.create({ botId: member.id, name: "Verifique", content: "Verifique", frequency: { ...everyThirtyMinutes, everyMinutes: 5 } })).toThrow("A temporary member cannot have a Rotina")
    await environment.close()
  })
})
