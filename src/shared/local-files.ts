import { z } from "zod"

export const localFileRequest = z.strictObject({
  action: z.enum(["open", "reveal", "copy", "copy-path"]),
  path: z.string().min(1).max(32768).refine((path) => !/[\0\r\n]/.test(path), "Caminho inválido"),
  directory: z.string().min(1).max(32768).optional(),
})

export type LocalFileRequest = z.infer<typeof localFileRequest>
