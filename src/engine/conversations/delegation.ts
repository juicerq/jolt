import { botSchemas, type Bot } from "@src/shared/bots"
import type { IncomingMessage } from "@src/shared/conversations"
import { delegateTool, transferTool, type Task } from "@src/shared/tasks"
import type { createBots } from "../bots/bots"
import type { Observability } from "../observability/observability"
import type { PiCustomTool } from "../pi/pi-agent-runtime"
import type { BotInheritance, TurnResult } from "./conversations"
import type { createTasks } from "../tasks/tasks"

const waitParameter = "\"yes\" to wait for the reply and receive it as this tool's result. \"no\" to continue now; the reply arrives later as a message from that Bot."
const memberParameters = {
  "provider?": "Provider id: codex or opencode. Defaults to the current provider.",
  "model?": "Exact model id. Defaults to the Leader model when hiring. An unavailable model fails before starting.",
  "effort?": "low, medium, high, xhigh or max. Defaults to the Leader effort when hiring.",
  "cwd?": "Absolute path to an existing working directory, such as a prepared worktree. Defaults to the Leader effective folder when hiring. Instructions alone do not change cwd.",
  "permissionMode?": "read-only, ask or full. Cannot exceed the Leader permission. When omitted on hire, follows the Leader's member permission setting.",
}

function memberSettings(params: Record<string, string>) {
  return Object.fromEntries(Object.keys(botSchemas.memberSettings.shape).filter((key) => params[key] !== undefined).map((key) => [key, params[key]]))
}

function memberReceipt(bot: Bot) {
  return `${bot.name} (${bot.id})\nModel: ${bot.provider} / ${bot.model ?? "provider default"}\nEffort: ${bot.effort}\nWorking directory: ${bot.effectiveWorkingDirectory}\nPermission: ${bot.permissionMode}\nLifetime: ${bot.temporary ? "temporary; available for follow-ups" : "permanent"}`
}

interface Assignment {
  from: Bot
  to: Bot
  message: IncomingMessage
  wait: boolean
  signal?: AbortSignal
}

function taskMessage(from: Pick<Bot, "id">, content: string): IncomingMessage {
  return { author: "bot", authorBotId: from.id, taskId: null, triggerRunId: null, content, images: [], replyTo: null }
}

const calledRule = "Other Bots can send you a Tarefa. Reply directly to whoever sent it. A direct order from the person prevails over any Tarefa; if the person changes or interrupts your work, say so in your reply."

export function createDelegation(input: {
  bots: ReturnType<typeof createBots>
  tasks: ReturnType<typeof createTasks>
  observability: Observability
  runTurn(botId: string, message: IncomingMessage, options?: { signal?: AbortSignal }): Promise<{ finished: Promise<TurnResult> }>
  steer(botId: string, message: IncomingMessage): Promise<boolean>
  drainQueue(botId: string): Promise<void>
  active(botId: string): { taskId: string | null } | undefined
  assertCallable(caller: Pick<Bot, "id">, target: Pick<Bot, "id" | "name">): void
  inheritance(leader: Bot, references: string | undefined): BotInheritance[]
}) {
  const running = new Map<string, { task: Task; botIds: Set<string>; cancellation: AbortController; signal: AbortSignal; settled: Promise<void>; pending: IncomingMessage[] }>()

  function members(leader: Pick<Bot, "id">) {
    return input.bots.list().filter((bot) => bot.leaderBotId === leader.id)
  }

  function targets(bot: Bot) {
    return [...members(bot), ...input.bots.colleagues(bot)]
  }

  function pickTarget(candidates: Bot[], reference: string) {
    const target = candidates.find((candidate) => candidate.id === reference || candidate.name === reference)

    if (!target) {
      const known = reference ? input.bots.get(reference) : undefined

      throw new Error(`${known?.name ?? (reference || "That Bot")} is not a member of your team nor a Colega of yours`)
    }

    return target
  }

  async function handoff(to: Bot, task: Task, message: IncomingMessage, signal?: AbortSignal, pending?: IncomingMessage[]): Promise<TurnResult> {
    return input.observability.span({ name: "delegation.turn", context: { botId: to.id, callerBotId: task.callerBotId, taskId: task.id } }, async () => {
      const turn = await input.runTurn(to.id, { ...message, taskId: task.id }, signal ? { signal } : undefined)

      while (pending?.length) {
        const next = pending[0]

        if (!next || !await input.steer(to.id, { ...next, taskId: task.id })) {
          break
        }

        pending.shift()
      }

      return turn.finished
    })
  }

  function summarize(to: Bot, task: Task, outcome: TurnResult) {
    if (outcome.reason === "stop" && outcome.report) {
      if (outcome.report.status === "blocked") {
        return `Tarefa blocked: ${outcome.report.content}`
      }

      return outcome.report.content
    }

    const status = outcome.reason === "aborted" ? `${to.name} was stopped.` : `${to.name} failed: ${outcome.error ?? "No Tarefa report was delivered."}`
    const partial = outcome.report?.content || outcome.response

    return [status, `Continue with delegate using the same Bot. Progress is preserved in its conversation (Tarefa ${task.id}).`, ...(partial ? [`Last saved message (partial, not a completed result):\n${partial}`] : [])].join("\n\n")
  }

  async function supplement(to: Bot, from: Bot, message: IncomingMessage) {
    const previous = input.tasks.latest(to.id, from.id)

    if (previous?.status !== "working") {
      return false
    }

    if (await input.steer(to.id, { ...message, taskId: previous.id })) {
      return true
    }

    const work = running.get(previous.id)

    if (!work || input.tasks.get(previous.id)?.status !== "working") {
      return false
    }

    work.pending.push(message)

    return true
  }

  async function assign({ from, to, message, wait, signal }: Assignment) {
    signal?.throwIfAborted()
    input.assertCallable(from, to)

    if (await supplement(to, from, message)) {
      return `Instructions added to ${to.name}'s current Tarefa. Its result will follow the original delegation.`
    }

    const parentId = input.active(from.id)?.taskId
    const parent = parentId ? running.get(parentId) : undefined
    const cancellation = new AbortController()
    const workSignal = AbortSignal.any([cancellation.signal, ...(parent ? [parent.signal] : []), ...(wait && signal ? [signal] : [])])
    workSignal.throwIfAborted()

    const task = input.tasks.begin({ callerBotId: from.id, assigneeBotId: to.id })
    const { promise: settled, resolve: settle } = Promise.withResolvers<void>()
    const pending: IncomingMessage[] = []
    running.set(task.id, { task, pending, botIds: new Set([from.id, to.id, ...parent?.botIds ?? []]), cancellation, signal: workSignal, settled })

    const finished = executeAssignment().finally(() => {
      if (running.get(task.id)?.settled === settled) {
        running.delete(task.id)
      }

      settle()
    })

    async function executeAssignment() {
      const outcome = await handoff(to, task, message, workSignal, pending).catch((error: unknown): TurnResult => {
        const reason = workSignal.aborted ? "aborted" : "error"
        input.tasks.finish(task.id, reason === "aborted" ? "interrupted" : "failed")

        return { reason, response: "", error: error instanceof Error ? error.message : "The Tarefa could not start." }
      })

      const delivery = !wait && !workSignal.aborted
        ? input.runTurn(from.id, { author: "bot", authorBotId: to.id, taskId: task.id, triggerRunId: null, content: summarize(to, task, outcome), images: [], replyTo: null }, { signal: workSignal }).then((turn) => turn.finished)
        : Promise.resolve()

      await Promise.all([delivery, drainAfter(outcome)])

      return outcome
    }

    async function drainAfter(outcome: TurnResult) {
      if (outcome.reason === "stop" && !workSignal.aborted) {
        for (const message of pending.splice(0)) {
          await assign({ from, to, message, wait: false, signal: workSignal })
        }

        await input.drainQueue(to.id).catch((error: unknown) => {
          input.observability.event({ name: "delegation.queuefailed", context: { botId: to.id, taskId: task.id }, error })
        })
      }
    }

    if (!wait) {
      void finished.catch((error: unknown) => {
        if (!workSignal.aborted) {
          input.observability.event({ name: "delegation.deliveryfailed", context: { botId: from.id, callerBotId: from.id, taskId: task.id }, error })
        }
      })

      return `Tarefa delegated to ${to.name}. ${to.name} will reply later as a message in this conversation.`
    }

    return summarize(to, task, await finished)
  }

  function delegateTo(bot: Bot): PiCustomTool {
    return {
      name: delegateTool,
      description: "Call an existing member or Colega. If working, add instructions to its current Tarefa without a second delivery. If blocked, interrupted or failed, resume it. After completion, start a new Tarefa in the same conversation and folder. You remain responsible for the result. Wait only when your next step depends on it.",
      parameters: {
        bot: "Name or id of the member or Colega",
        instructions: "What the Bot must do and the result you expect",
        wait: waitParameter,
      },
      async execute(params, signal) {
        return assign({ from: bot, to: pickTarget(targets(bot), params.bot ?? ""), message: taskMessage(bot, params.instructions ?? ""), wait: params.wait !== "no", ...(signal ? { signal } : {}) })
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
    async continuePerson(task: Task, message: IncomingMessage) {
      const from = input.bots.get(task.callerBotId)
      const to = input.bots.get(task.assigneeBotId)

      if (!from || !to) {
        throw new Error("The Bots responsible for this Tarefa no longer exist")
      }

      await assign({ from, to, message, wait: false })
    },
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

            const to = pickTarget(members(leader).filter((member) => !member.temporary), params.bot ?? "")

            if (to.id === bot.id) {
              throw new Error("You already own this Tarefa")
            }

            input.assertCallable(bot, to)
            const transferred = input.tasks.transfer(task.id, to.id)
            const outcome = await handoff(to, transferred, taskMessage(bot, params.instructions ?? ""), signal)

            return summarize(to, transferred, outcome)
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
        description: "Add a member to your team and delegate its first Tarefa in the same call. Configure the member before its first action. It cannot create Bots. A permanent member stays for future Tarefas; a temporary one stays available for follow-up Tarefas in the same conversation. Use it when no current member fits the Tarefa.",
        parameters: {
          ...memberParameters,
          name: "Name of the member",
          role: "The member's Função: what it delivers, in one line",
          "description?": "Responsibilities, limits and how the member presents its work",
          permanent: "\"yes\" to keep the member on your team for future Tarefas. \"no\" for a temporary member created for this work, available for follow-ups.",
          instructions: "What the member must do and the result you expect",
          wait: waitParameter,
          "plugins?": "Contas the member may use, by label, separated by commas. Only Contas you use yourself. Leave empty for none.",
        },
        async execute(params, signal) {
          signal?.throwIfAborted()
          const inherited = input.inheritance(bot, params.plugins)
          const to = await input.bots.hire(bot, { ...memberSettings(params), name: params.name, permanent: params.permanent === "yes", function: { outcome: params.role, ...(params.description ? { description: params.description } : {}) } })

          if (signal?.aborted) {
            await input.bots.remove(to.id)
            signal.throwIfAborted()
          }

          for (const inheritance of inherited) {
            inheritance.apply(to)
          }

          return `${memberReceipt(to)}\n\n${await assign({ from: bot, to, message: taskMessage(bot, params.instructions ?? ""), wait: params.wait !== "no", ...(signal ? { signal } : {}) })}`
        },
      }
      const configure: PiCustomTool = {
        name: "configure_member",
        description: "Change your own member's execution settings. Permission applies immediately, including pending approvals. Model, effort and cwd apply on the next turn. Omitted fields stay unchanged. Use delegate to continue with the same member, including after completion.",
        parameters: { bot: "Name or id of your member", ...memberParameters },
        async execute(params, signal) {
          signal?.throwIfAborted()
          const to = pickTarget(members(bot), params.bot ?? "")
          const updated = await input.bots.configureMember(bot.id, to.id, memberSettings(params))

          return `${memberReceipt(updated)}\nPermission applied now. Model, effort and working directory apply on the next turn.`
        },
      }

      const models: PiCustomTool = {
        name: "list_models",
        description: "List available providers and exact model ids before choosing a member's model.",
        parameters: {},
        async execute() {
          return JSON.stringify(await input.bots.models())
        },
      }

      return [hire, configure, models, delegateTo(bot)]
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
          ...team.map((member) => `- ${member.name} (${member.id}): ${member.function.outcome}${member.closed ? " [inactive; available with delegate]" : ""}`),
          "Use the delegate tool to assign a Tarefa to the member whose Function fits it.",
        ]
        : []

      return [
        calledRule,
        ...teamLines,
        hiring,
        `New members inherit your model, effort and effective working directory. Their default permission is ${bot.inheritMemberPermissions ? bot.permissionMode : "ask"}. Supply execution fields in hire; putting them in instructions does not configure the member. Use configure_member to change your own members. Use delegate for follow-ups: working members receive additional instructions; blocked, interrupted or failed Tarefas resume; completed members start a new Tarefa with their existing conversation and folder. Do not hire replacements for continuation.`,
        ...colleagueLines,
        "You remain responsible for the overall result. Orders from the person prevail over yours.",
      ].join("\n")
    },
  }
}
