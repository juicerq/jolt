import { z } from "zod"
import { messageAuthor } from "./conversations"

export const historyTools = { search: "search_history", read: "read_history" } as const
export const historyLimits = { results: 12, excerpt: 600, content: 12_000, neighbors: 2 } as const

const reference = z.strictObject({
  id: z.string().min(1),
  author: messageAuthor,
  authorBotId: z.string().nullable(),
  taskId: z.string().nullable(),
  createdAt: z.string().min(1),
  content: z.string(),
})

export const historySchemas = {
  search: z.strictObject({
    query: z.string().trim().min(1).max(300),
    after: z.iso.date().optional(),
    before: z.iso.date().optional(),
    offset: z.number().int().min(0).max(100_000).default(0),
  }),
  read: z.strictObject({
    id: z.string().min(1),
    offset: z.number().int().min(0).default(0),
  }),
  references: z.array(reference),
  reference,
}

export type HistorySearch = z.infer<typeof historySchemas.search>
