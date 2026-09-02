import { z } from "zod"

const id = z.string().min(1)
const taskStatus = z.enum(["working", "done", "interrupted", "failed"])
const task = z.strictObject({
  id,
  leaderBotId: id,
  assigneeBotId: id,
  outcome: id,
  status: taskStatus,
  createdAt: id,
  finishedAt: id.nullable(),
})

export const taskSchemas = {
  leaderInput: z.strictObject({ leaderBotId: id }),
  task,
  taskList: z.array(task),
}

export type Task = z.infer<typeof task>
export type TaskStatus = z.infer<typeof taskStatus>
