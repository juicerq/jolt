import { z } from "zod"

export function parse<Schema extends z.ZodType>(schema: Schema, value: unknown): z.output<Schema> {
  const result = schema.safeParse(value)

  if (!result.success) {
    throw new Error(z.prettifyError(result.error), { cause: result.error })
  }

  return result.data
}
