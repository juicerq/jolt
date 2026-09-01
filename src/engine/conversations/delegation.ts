import type { Bot } from "../../shared/bots"
import type { ConversationEvent, ConversationMessage } from "../../shared/conversations"
import type { Task } from "../../shared/tasks"
import type { createBots } from "../bots/bots"
import type { Observability } from "../observability/observability"
import type { PiCustomTool } from "../pi/pi-agent-runtime"
import type { createTasks } from "../tasks/tasks"

type Outcome = { reason: "stop" | "aborted" | "error"; response: string }

export function createDelegation(input: {
  bots: ReturnType<typeof createBots>
  tasks: ReturnType<typeof createTasks>
  observability: Observability
  runTurn(botId: string, message: Pick<ConversationMessage, "author" | "authorBotId" | "taskId" | "content">): AsyncGenerator<ConversationEvent>
  active(botId: string): { taskId: string | null } | undefined
}) {
  function members(leader: Pick<Bot, "id">) {
    return input.bots.list().filter((bot) => bot.leaderBotId === leader.id)
  }

  function pickMember(leader: Bot, reference: string) {
    const member = members(leader).find((candidate) => candidate.id === reference || candidate.name === reference)

    if (!member) {
      const known = reference ? input.bots.get({ id: reference }) : undefined

      throw new Error(`${known?.name ?? (reference || "That Bot")} is not a member of ${leader.name}`)
    }

    if (input.active(member.id)) {
      throw new Error(`${member.name} is already working`)
    }

    return member
  }

  async function handoff(from: Bot, to: Bot, task: Task, content: string): Promise<Outcome> {
    return input.observability.span({ name: "delegation.turn", context: { botId: to.id, leaderBotId: task.leaderBotId, taskId: task.id } }, async () => {
      const outcome: Outcome = { reason: "error", response: "" }

      for await (const event of input.runTurn(to.id, { author: "bot", authorBotId: from.id, taskId: task.id, content })) {
        if (event.type === "text") {
          outcome.response += event.text
        }

        if (event.type === "finished") {
          outcome.reason = event.reason
        }
      }

      return outcome
    })
  }

  function summarize(to: Bot, outcome: Outcome) {
    if (outcome.reason === "stop") {
      return outcome.response || `${to.name} finished without a reply.`
    }

    if (outcome.reason === "aborted") {
      return [`The person gave ${to.name} a direct order and interrupted this delegation. The person's order prevails.`, outcome.response].filter(Boolean).join("\n\nPartial reply:\n")
    }

    return `${to.name} failed before finishing.`
  }

  function describe(to: Bot, outcome: Outcome) {
    const summary = summarize(to, outcome)

    if (outcome.reason === "error") {
      throw new Error(summary)
    }

    return summary
  }

  const statusByReason = { stop: "done", aborted: "interrupted", error: "failed" } as const

  async function delegate(from: Bot, to: Bot, task: Task, content: string) {
    const outcome = await handoff(from, to, task, content)
    input.tasks.finish(task.id, statusByReason[outcome.reason])

    return outcome
  }

  async function deliverLater(from: Bot, to: Bot, task: Task, content: string) {
    const outcome = await delegate(from, to, task, content)

    await Array.fromAsync(input.runTurn(from.id, { author: "bot", authorBotId: to.id, taskId: task.id, content: summarize(to, outcome) }))
  }

  return {
    tools(bot: Bot): PiCustomTool[] {
      if (bot.leaderBotId) {
        return [{
          name: "transfer",
          description: "Hand your current Tarefa to another member of your team when their Function fits it better. The member replies to you; you still answer the Leader.",
          parameters: { member: "Name or id of the member who receives the Tarefa", instructions: "What the member must do" },
          async execute(params) {
            const taskId = input.active(bot.id)?.taskId
            const task = taskId ? input.tasks.get(taskId) : undefined

            if (!task) {
              throw new Error("You have no active Tarefa to transfer")
            }

            const leader = input.bots.get({ id: bot.leaderBotId ?? "" })

            if (!leader) {
              throw new Error("Leader not found")
            }

            const to = pickMember(leader, params.member ?? "")

            if (to.id === bot.id) {
              throw new Error("You already own this Tarefa")
            }

            input.tasks.transfer(task.id, to.id)
            const outcome = await handoff(bot, to, { ...task, assigneeBotId: to.id }, params.instructions ?? "")

            return describe(to, outcome)
          },
        }]
      }

      if (members(bot).length === 0) {
        return []
      }

      return [{
        name: "delegate",
        description: "Create a Tarefa and delegate it to one member of your team. You remain responsible for the overall result. Wait when your next step depends on the reply; do not wait when you can keep working or will delegate more Tarefas.",
        parameters: {
          member: "Name or id of the member",
          outcome: "Expected result of the Tarefa",
          instructions: "Instructions for the member",
          wait: "\"yes\" to wait for the reply and receive it as this tool's result. \"no\" to continue now; the reply arrives later as a message from the member.",
        },
        async execute(params) {
          const to = pickMember(bot, params.member ?? "")
          const task = input.tasks.create({ leaderBotId: bot.id, assigneeBotId: to.id, outcome: params.outcome ?? "" })
          const content = [params.outcome, params.instructions].filter(Boolean).join("\n\n")

          if (params.wait === "no") {
            void deliverLater(bot, to, task, content).catch((error) => {
              input.observability.event({ name: "delegation.deliveryfailed", context: { botId: bot.id, leaderBotId: bot.id, taskId: task.id }, error })
            })

            return `Tarefa delegated to ${to.name}. ${to.name} will reply later as a message in this conversation.`
          }

          return describe(to, await delegate(bot, to, task, content))
        },
      }]
    },
    instructions(bot: Bot) {
      if (bot.leaderBotId) {
        const leader = input.bots.get({ id: bot.leaderBotId })

        return [
          `You are a member of the team led by ${leader?.name ?? "your Leader"}. Reply directly to whoever sent you the Tarefa.`,
          "Authority order: the person, then the Leader, then you. A direct order from the person prevails over the Leader's instructions.",
          "If the person changes or interrupts your work, say so in your reply to the Leader.",
        ].join("\n")
      }

      const team = members(bot)

      if (team.length === 0) {
        return undefined
      }

      return [
        "You lead a team. Each member and the outcome their Function delivers:",
        ...team.map((member) => `- ${member.name}: ${member.function.outcome}`),
        "Use the delegate tool to assign a Tarefa to the member whose Function fits it. Wait for the reply when you need it before your next step; otherwise continue and the reply arrives later as a message.",
        "You remain responsible for the overall result. Orders from the person prevail over yours.",
      ].join("\n")
    },
  }
}
