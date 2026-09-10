import { z } from "zod"
import { id } from "./ids"

const input = z.strictObject({ botId: id, path: z.string().max(32768).refine((path) => !path.includes("\0")) })
const entry = z.object({ name: z.string(), path: z.string(), kind: z.enum(["directory", "file", "unavailable"]), size: z.number() })

export const botArchiveSchemas = {
  input,
  listing: z.object({ directory: z.string(), entries: z.array(entry) }),
  preview: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("text"), content: z.string() }),
    z.object({ kind: z.literal("image"), content: z.string() }),
    z.object({ kind: z.enum(["pdf", "audio", "video"]), content: z.string() }),
    z.object({ kind: z.literal("unsupported"), reason: z.string() }),
  ]),
}

export type BotArchiveInput = z.infer<typeof input>
export type BotArchiveEntry = z.infer<typeof entry>

export type BotArchivePreview = z.infer<typeof botArchiveSchemas.preview>
