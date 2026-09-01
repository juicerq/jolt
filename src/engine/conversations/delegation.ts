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

  function describe(to: Bot, outcome: Outcome) {
    if (outcome.reason === "stop") {
      return outcome.response || `${to.name} finished without a reply.`
    }

    if (outcome.reason === "aborted") {
      return [`The person gave ${to.name} a direct order and interrupted this delegation. The person's order prevails.`, outcome.response].filter(Boolean).join("\n\nPartial reply:\n")
    }

    return `${to.name} failed before finishing.`
  }

  const statusByReason = { stop: "done", aborted: "interrupted", error: "failed" } as const

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
        description: "Create a Tarefa and delegate it to one member of your team. Waits for the member's reply. You remain responsible for the overall result.",
        parameters: { member: "Name or id of the member", outcome: "Expected result of the Tarefa", instructions: "Instructions for the member" },
        async execute(params) {
          const to = pickMember(bot, params.member ?? "")
          const task = input.tasks.create({ leaderBotId: bot.id, assigneeBotId: to.id, outcome: params.outcome ?? "" })
          const outcome = await handoff(bot, to, task, [params.outcome, params.instructions].filter(Boolean).join("\n\n"))
          input.tasks.finish(task.id, statusByReason[outcome.reason])

          return describe(to, outcome)
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

      const names = members(bot).map((member) => member.name)

      if (names.length === 0) {
        return undefined
      }

      return [
        `You lead a team: ${names.join(", ")}. Use the delegate tool to assign a Tarefa to one member and wait for the reply.`,
        "You remain responsible for the overall result. Orders from the person prevail over yours.",
      ].join("\n")
    },
  }
}
