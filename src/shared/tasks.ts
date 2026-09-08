import { z } from "zod"
import { id } from "./ids"

const taskStatus = z.enum(["working", "done", "blocked", "interrupted", "failed"])
const task = z.strictObject({
  id,
  callerBotId: id,
  assigneeBotId: id,
  status: taskStatus,
  createdAt: id,
  finishedAt: id.nullable(),
})

const taskReport = z.strictObject({ status: z.enum(["done", "blocked"]), content: z.string().trim().min(1) })

export const reportTaskTool = "report_task"
export const delegateTool = "delegate"
export const transferTool = "transfer"

export const taskSchemas = {
  task,
  taskReport,
  taskList: z.array(task),
}

export type Task = z.infer<typeof task>
export type TaskStatus = z.infer<typeof taskStatus>

export type TaskReport = z.infer<typeof taskReport>
