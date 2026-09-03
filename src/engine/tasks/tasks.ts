import type { Task, TaskStatus } from "../../shared/tasks"
import { taskSchemas } from "../../shared/tasks"
import type { Observability } from "../observability/observability"
import type { AppDatabase } from "../persistence/database"
import { parse } from "../../shared/parse"

export function createTasks({ database, observability }: { database: AppDatabase; observability: Observability }) {
  function update(id: string, changes: Partial<Pick<Task, "assigneeBotId" | "status" | "finishedAt">>) {
    const task = database.tasks.update(id, changes)

    if (!task) {
      throw new Error("Tarefa not found")
    }

    return task
  }

  const interruptedCount = database.tasks.interruptWorking(new Date().toISOString())

  observability.event({ name: "tasks.interruptorphans", attributes: { count: interruptedCount } })

  return {
    create(input: Pick<Task, "callerBotId" | "assigneeBotId" | "outcome">) {
      const task: Task = { id: crypto.randomUUID(), ...input, status: "working", createdAt: new Date().toISOString(), finishedAt: null }

      return observability.span({ name: "tasks.create", context: { taskId: task.id, callerBotId: task.callerBotId, botId: task.assigneeBotId } }, () => database.tasks.create(task))
    },
    finish(id: string, status: Exclude<TaskStatus, "working">) {
      return observability.span({ name: "tasks.finish", attributes: { state: status }, context: { taskId: id } }, () => update(id, { status, finishedAt: new Date().toISOString() }))
    },
    transfer(id: string, assigneeBotId: string) {
      return observability.span({ name: "tasks.transfer", context: { taskId: id, botId: assigneeBotId } }, () => update(id, { assigneeBotId }))
    },
    get(id: string) {
      return database.tasks.get(id)
    },
    listForBot(rawInput: unknown) {
      const { botId } = parse(taskSchemas.botInput, rawInput)

      return database.tasks.listForBot(botId)
    },
  }
}
