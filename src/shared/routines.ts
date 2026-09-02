import { type } from "arktype"
import { weekdays } from "./weekdays"

const weekday = type.enumerated(...weekdays)
const interval = type({ "+": "reject", form: type.enumerated("interval"), everyMinutes: "number.integer >= 1" })
const fixedTime = type({ "+": "reject", form: type.enumerated("fixed-time"), days: weekday.array().atLeastLength(1), time: /^([01]\d|2[0-3]):[0-5]\d$/ })
const once = type({ "+": "reject", form: type.enumerated("once"), at: "string > 0" })
const frequency = interval.or(fixedTime).or(once)
const routine = type({
  "+": "reject",
  id: "string > 0",
  botId: "string > 0",
  content: "string > 0",
  frequency,
  enabled: "boolean",
  nextCallAt: "string > 0",
  createdAt: "string > 0",
})

export const routineSchemas = {
  createInput: routine.pick("botId", "content", "frequency").merge({ "+": "reject" }),
  updateInput: routine.pick("id", "content", "frequency", "enabled").merge({ "+": "reject" }),
  idInput: type({ "+": "reject", id: "string > 0" }),
  botInput: type({ "+": "reject", botId: "string > 0" }),
  frequency,
  routine,
  routineList: routine.array(),
}

export type Routine = typeof routine.infer
export type Frequency = typeof frequency.infer
export type Weekday = typeof weekday.infer
