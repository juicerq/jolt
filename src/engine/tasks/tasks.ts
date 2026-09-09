import type { Task, TaskStatus } from "@src/shared/tasks"
import type { Observability } from "../observability/observability"
import type { AppDatabase } from "../persistence/database"

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

  function latest(assigneeBotId: string, callerBotId?: string) {
    return database.tasks.listForBot(assigneeBotId).findLast((task) => task.assigneeBotId === assigneeBotId && (!callerBotId || task.callerBotId === callerBotId))
  }

  function create(input: Pick<Task, "callerBotId" | "assigneeBotId">) {
    const task: Task = { id: crypto.randomUUID(), ...input, status: "working", createdAt: new Date().toISOString(), finishedAt: null }

    return observability.span({ name: "tasks.create", context: { taskId: task.id, callerBotId: task.callerBotId, botId: task.assigneeBotId } }, () => database.tasks.create(task))
  }

  return {
    create,
    latest,
    begin(input: Pick<Task, "callerBotId" | "assigneeBotId">) {
      const previous = latest(input.assigneeBotId, input.callerBotId)

      if (!previous || previous.status === "done") {
        return create(input)
      }

      if (previous.status === "working") {
        return previous
      }

      return update(previous.id, { status: "working", finishedAt: null })
    },
    finish(id: string, status: Exclude<TaskStatus, "working">) {
      return observability.span({ name: "tasks.finish", attributes: { state: status }, context: { taskId: id } }, () => update(id, { status, finishedAt: status === "blocked" ? null : new Date().toISOString() }))
    },
    transfer(id: string, assigneeBotId: string) {
      return observability.span({ name: "tasks.transfer", context: { taskId: id, botId: assigneeBotId } }, () => update(id, { assigneeBotId }))
    },
    get(id: string) {
      return database.tasks.get(id)
    },
    listForBot(botId: string) {
      return database.tasks.listForBot(botId)
    },
  }
}
