import { z } from "zod"
import { weekdays } from "./weekdays"

const id = z.string().min(1)
const weekday = z.enum(weekdays)
const interval = z.strictObject({ form: z.literal("interval"), everyMinutes: z.int().min(1) })
const fixedTime = z.strictObject({ form: z.literal("fixed-time"), days: z.array(weekday).min(1), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/) })
const once = z.strictObject({ form: z.literal("once"), at: id })
const frequency = z.discriminatedUnion("form", [interval, fixedTime, once])
const routine = z.strictObject({
  id,
  botId: id,
  content: id,
  frequency,
  enabled: z.boolean(),
  nextCallAt: id,
  createdAt: id,
})

export const routineSchemas = {
  createInput: routine.pick({ botId: true, content: true, frequency: true }),
  updateInput: routine.pick({ id: true, content: true, frequency: true, enabled: true }),
  idInput: z.strictObject({ id }),
  botInput: z.strictObject({ botId: id }),
  frequency,
  routine,
  routineList: z.array(routine),
}

export type Routine = z.infer<typeof routine>
export type Frequency = z.infer<typeof frequency>
export type Weekday = z.infer<typeof weekday>
