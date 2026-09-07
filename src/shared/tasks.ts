import { z } from "zod"
import { id } from "./ids"

const taskStatus = z.enum(["working", "done", "interrupted", "failed"])
const task = z.strictObject({
  id,
  callerBotId: id,
  assigneeBotId: id,
  status: taskStatus,
  createdAt: id,
  finishedAt: id.nullable(),
})

export const delegateTool = "delegate"
export const transferTool = "transfer"

export const taskSchemas = {
  task,
  taskList: z.array(task),
}

export type Task = z.infer<typeof task>
export type TaskStatus = z.infer<typeof taskStatus>
