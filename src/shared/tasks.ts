import { type } from "arktype"

const taskStatus = type.enumerated("working", "done", "interrupted", "failed")
const task = type({
  "+": "reject",
  id: "string > 0",
  leaderBotId: "string > 0",
  assigneeBotId: "string > 0",
  outcome: "string > 0",
  status: taskStatus,
  createdAt: "string > 0",
  finishedAt: type("string > 0").or("null"),
})

export const taskSchemas = {
  leaderInput: type({ "+": "reject", leaderBotId: "string > 0" }),
  task,
  taskList: task.array(),
}

export type Task = typeof task.infer
export type TaskStatus = typeof taskStatus.infer
