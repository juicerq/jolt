import type { Bot } from "@src/shared/bots"
import type { IncomingMessage } from "@src/shared/conversations"
import { delegateTool, transferTool, type Task } from "@src/shared/tasks"
import type { createBots } from "../bots/bots"
import type { Observability } from "../observability/observability"
import type { PiCustomTool } from "../pi/pi-agent-runtime"
import type { BotInheritance, TurnResult } from "./conversations"
import type { createTasks } from "../tasks/tasks"

const waitParameter = "\"yes\" to wait for the reply and receive it as this tool's result. \"no\" to continue now; the reply arrives later as a message from that Bot."
const calledRule = "Other Bots can send you a Tarefa. Reply directly to whoever sent it. A direct order from the person prevails over any Tarefa; if the person changes or interrupts your work, say so in your reply."

export function createDelegation(input: {
  bots: ReturnType<typeof createBots>
  tasks: ReturnType<typeof createTasks>
  observability: Observability
  runTurn(botId: string, message: IncomingMessage, options?: { signal?: AbortSignal }): Promise<{ finished: Promise<TurnResult> }>
  active(botId: string): { taskId: string | null } | undefined
  assertCallable(caller: Pick<Bot, "id">, target: Pick<Bot, "id" | "name">): void
  inheritance(leader: Bot, references: string | undefined): BotInheritance[]
}) {
  const running = new Map<string, { task: Task; botIds: Set<string>; cancellation: AbortController; signal: AbortSignal; settled: Promise<void> }>()

  function members(leader: Pick<Bot, "id">) {
    return input.bots.list().filter((bot) => bot.leaderBotId === leader.id && !bot.temporary)
  }

  function targets(bot: Bot) {
    return [...members(bot), ...input.bots.colleagues(bot)]
  }

  function pickTarget(caller: Bot, candidates: Bot[], reference: string) {
    const target = candidates.find((candidate) => candidate.id === reference || candidate.name === reference)

    if (!target) {
      const known = reference ? input.bots.get(reference) : undefined

      throw new Error(`${known?.name ?? (reference || "That Bot")} is not a member of your team nor a Colega of yours`)
    }

    input.assertCallable(caller, target)

    return target
  }

  async function handoff(from: Bot, to: Bot, task: Task, content: string, signal?: AbortSignal): Promise<TurnResult> {
    return input.observability.span({ name: "delegation.turn", context: { botId: to.id, callerBotId: task.callerBotId, taskId: task.id } }, async () => {
      const turn = await input.runTurn(to.id, { author: "bot", authorBotId: from.id, taskId: task.id, triggerRunId: null, content, images: [], replyTo: null }, signal ? { signal } : undefined)

      return turn.finished
    })
  }

  function summarize(to: Bot, outcome: TurnResult) {
    if (outcome.reason === "stop") {
      return outcome.response || `${to.name} finished without a reply.`
    }

    if (outcome.reason === "aborted") {
      return [`The person gave ${to.name} a direct order and interrupted this delegation. The person's order prevails.`, outcome.response].filter(Boolean).join("\n\nPartial reply:\n")
    }

    return `${to.name} failed before finishing.`
  }

  function describe(to: Bot, outcome: TurnResult) {
    const summary = summarize(to, outcome)

    if (outcome.reason === "error") {
      throw new Error(summary)
    }

    return summary
  }

  const statusByReason = { stop: "done", aborted: "interrupted", error: "failed" } as const

  async function delegate(from: Bot, to: Bot, task: Task, content: string, signal?: AbortSignal) {
    const outcome = await handoff(from, to, task, content, signal).catch((error: unknown) => {
      input.tasks.finish(task.id, signal?.aborted ? "interrupted" : "failed")

      throw error
    })
    input.tasks.finish(task.id, statusByReason[outcome.reason])

    return outcome
  }

  async function assign(from: Bot, to: Bot, params: Record<string, string>, signal?: AbortSignal) {
    signal?.throwIfAborted()

    const parentId = input.active(from.id)?.taskId
    const parent = parentId ? running.get(parentId) : undefined
    const cancellation = new AbortController()
    const workSignal = AbortSignal.any([cancellation.signal, ...(parent ? [parent.signal] : []), ...(params.wait !== "no" && signal ? [signal] : [])])
    workSignal.throwIfAborted()

    const task = input.tasks.create({ callerBotId: from.id, assigneeBotId: to.id })
    const { promise: settled, resolve: settle } = Promise.withResolvers<void>()
    running.set(task.id, { task, botIds: new Set([from.id, to.id, ...parent?.botIds ?? []]), cancellation, signal: workSignal, settled })

    const finished = executeAssignment().finally(() => {
      running.delete(task.id)
      settle()
    })

    async function executeAssignment() {
      const outcome = await delegate(from, to, task, params.instructions ?? "", workSignal)

      if (params.wait === "no" && !workSignal.aborted) {
        const turn = await input.runTurn(from.id, { author: "bot", authorBotId: to.id, taskId: task.id, triggerRunId: null, content: summarize(to, outcome), images: [], replyTo: null }, { signal: workSignal })

        await turn.finished
      }

      return outcome
    }

    if (params.wait === "no") {
      void finished.catch((error: unknown) => {
        if (!workSignal.aborted) {
          input.observability.event({ name: "delegation.deliveryfailed", context: { botId: from.id, callerBotId: from.id, taskId: task.id }, error })
        }
      })

      return `Tarefa delegated to ${to.name}. ${to.name} will reply later as a message in this conversation.`
    }

    return describe(to, await finished)
  }

  function delegateTo(bot: Bot): PiCustomTool {
    return {
      name: delegateTool,
      description: "Create a Tarefa and delegate it to a member of your team or to a Colega. You remain responsible for the overall result. Wait when your next step depends on the reply; do not wait when you can keep working or will delegate more Tarefas.",
      parameters: {
        bot: "Name or id of the member or Colega",
        instructions: "What the Bot must do and the result you expect",
        wait: waitParameter,
      },
      async execute(params, signal) {
        return assign(bot, pickTarget(bot, targets(bot), params.bot ?? ""), params, signal)
      },
    }
  }

  function workFor(botIds: Set<string>) {
    return [...running.values()].filter((work) => {
      const task = input.tasks.get(work.task.id) ?? work.task

      return botIds.has(task.assigneeBotId) || [...work.botIds].some((id) => botIds.has(id))
    })
  }

  return {
    hasWork(botIds: Set<string>) {
      return workFor(botIds).length > 0
    },
    async abortFor(botIds: Set<string>) {
      const pending = workFor(botIds)

      for (const work of pending) {
        work.cancellation.abort()
      }

      await Promise.all(pending.map((work) => work.settled))
    },
    tools(bot: Bot): PiCustomTool[] {
      if (bot.leaderBotId) {
        const transfer: PiCustomTool = {
          name: transferTool,
          description: "Hand your current Tarefa to another member of your team when their Function fits it better. The member replies to you; you still answer whoever sent you the Tarefa.",
          parameters: { bot: "Name or id of the member who receives the Tarefa", instructions: "What the member must do" },
          async execute(params, signal) {
            const taskId = input.active(bot.id)?.taskId
            const task = taskId ? input.tasks.get(taskId) : undefined

            if (!task) {
              throw new Error("You have no active Tarefa to transfer")
            }

            if (!bot.leaderBotId) {
              throw new Error("Leader not found")
            }

            const leader = input.bots.get(bot.leaderBotId)

            if (!leader) {
              throw new Error("Leader not found")
            }

            const to = pickTarget(bot, members(leader), params.bot ?? "")

            if (to.id === bot.id) {
              throw new Error("You already own this Tarefa")
            }

            const transferred = input.tasks.transfer(task.id, to.id)
            const outcome = await handoff(bot, to, transferred, params.instructions ?? "", signal)

            return describe(to, outcome)
          },
        }
        const colleagues = input.bots.colleagues(bot)

        if (colleagues.length === 0) {
          return [transfer]
        }

        return [transfer, delegateTo(bot)]
      }

      const hire: PiCustomTool = {
        name: "hire",
        description: "Add a member to your team and delegate its first Tarefa in the same call. The member inherits your folder and executor and cannot create Bots. A permanent member stays for future Tarefas; a temporary one closes when this Tarefa ends. Use it when no current member fits the Tarefa.",
        parameters: {
          name: "Name of the member",
          role: "The member's Função: what it delivers, in one line",
          "description?": "Responsibilities, limits and how the member presents its work",
          permanent: "\"yes\" to keep the member on your team for future Tarefas. \"no\" for a temporary member that closes when this Tarefa ends.",
          instructions: "What the member must do and the result you expect",
          wait: waitParameter,
          "plugins?": "Contas the member may use, by label, separated by commas. Only Contas you use yourself. Leave empty for none.",
        },
        async execute(params, signal) {
          signal?.throwIfAborted()
          const inherited = input.inheritance(bot, params.plugins)
          const to = await input.bots.hire(bot, { name: params.name, permanent: params.permanent === "yes", function: { outcome: params.role, ...(params.description ? { description: params.description } : {}) } })

          if (signal?.aborted) {
            await input.bots.remove(to.id)
            signal.throwIfAborted()
          }

          for (const inheritance of inherited) {
            inheritance.apply(to)
          }

          return assign(bot, to, params, signal)
        },
      }

      return [hire, delegateTo(bot)]
    },
    instructions(bot: Bot) {
      const colleagues = input.bots.colleagues(bot)
      const colleagueLines = colleagues.length > 0 && bot.permissionMode !== "read-only"
        ? [
          "Colegas you can call with the delegate tool, and the outcome each delivers:",
          ...colleagues.map((colleague) => `- ${colleague.name}: ${colleague.function.outcome}`),
          "A Colega is not on your team: it follows its own settings and the person can revoke it at any time.",
        ]
        : []

      if (bot.leaderBotId) {
        const leader = input.bots.get(bot.leaderBotId)

        return [
          `You are a member of the team led by ${leader?.name ?? "your Leader"}.`,
          calledRule,
          "Authority order: the person, then the Leader, then you.",
          ...colleagueLines,
        ].join("\n")
      }

      if (bot.permissionMode === "read-only") {
        return calledRule
      }

      const team = members(bot)
      const hiring = "Use the hire tool when nobody on your team fits a Tarefa: permanent yes when the Função will be needed again, no for a one-off member. Wait for the reply when you need it before your next step; otherwise continue and the reply arrives later as a message."
      const teamLines = team.length > 0
        ? [
          "You lead a team. Each member and the outcome their Function delivers:",
          ...team.map((member) => `- ${member.name}: ${member.function.outcome}`),
          "Use the delegate tool to assign a Tarefa to the member whose Function fits it.",
        ]
        : []

      return [
        calledRule,
        ...teamLines,
        hiring,
        ...colleagueLines,
        "You remain responsible for the overall result. Orders from the person prevail over yours.",
      ].join("\n")
    },
  }
}
