import { z } from "zod"

export const id = z.string().min(1)
export const optionalId = id.nullable()
export const idInput = z.strictObject({ id })
export const botInput = z.strictObject({ botId: id })
