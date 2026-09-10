import { z } from "zod"

const skill = z.strictObject({ name: z.string().min(1), description: z.string() })

export const skillList = z.array(skill)
export type Skill = z.infer<typeof skill>
