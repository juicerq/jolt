import { z } from "zod"

export const localFileLocation = z.strictObject({
  path: z.string().min(1).max(32768).refine((path) => !/[\0\r\n]/.test(path), "Caminho inválido"),
  directory: z.string().min(1).max(32768).optional(),
})

export const localFileRequest = localFileLocation.extend({
  action: z.enum(["open", "reveal", "copy", "copy-path"]),
})

export type LocalFileLocation = z.infer<typeof localFileLocation>
export type LocalFileRequest = z.infer<typeof localFileRequest>
