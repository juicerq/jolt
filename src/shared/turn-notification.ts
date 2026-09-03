import { z } from "zod"

export const turnNotification = z.strictObject({
  title: z.string().min(1),
  body: z.string().min(1),
})

export type TurnNotification = z.infer<typeof turnNotification>
