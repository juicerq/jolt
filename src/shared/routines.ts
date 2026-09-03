import { z } from "zod"
import { weekdays } from "./weekdays"

const id = z.string().min(1)
const weekday = z.enum(weekdays)
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
const chosenDays = z.array(weekday).min(1)
const interval = z.strictObject({ form: z.literal("interval"), everyMinutes: z.int().min(1), days: chosenDays, startTime: time, endTime: time })
const fixedTime = z.strictObject({ form: z.literal("fixed-time"), days: chosenDays, times: z.array(time).min(1).transform((times) => [...new Set(times)].sort()) })
const once = z.strictObject({ form: z.literal("once"), at: id })
const frequency = z.discriminatedUnion("form", [interval, fixedTime, once]).superRefine((value, context) => {
  if (value.form === "interval" && value.endTime < value.startTime) {
    context.addIssue({ code: "custom", message: "End time must not be before start time", path: ["endTime"] })
  }
})
const status = z.enum(["active", "paused", "completed", "failed"])
const routine = z.strictObject({
  id,
  botId: id,
  name: id,
  content: id,
  frequency,
  status,
  timeZone: id,
  nextCallAt: id.nullable(),
  createdAt: id,
})

export const routineSchemas = {
  createInput: routine.pick({ botId: true, name: true, content: true, frequency: true }),
  updateInput: routine.pick({ id: true, name: true, content: true, frequency: true, status: true }),
  idInput: z.strictObject({ id }),
  botInput: z.strictObject({ botId: id }),
  frequency,
  status,
  routine,
  routineList: z.array(routine),
}

export type Routine = z.infer<typeof routine>
export type Frequency = z.infer<typeof frequency>
export type Weekday = z.infer<typeof weekday>
