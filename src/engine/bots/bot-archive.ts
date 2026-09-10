import { open, readdir, realpath, stat } from "node:fs/promises"
import { extname, isAbsolute, relative, resolve, sep } from "node:path"
import type { BotArchiveInput } from "@src/shared/bot-archive"
import type { createBots } from "./bots"

const imageTypes: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".avif": "image/avif", ".svg": "image/svg+xml", ".bmp": "image/bmp", ".ico": "image/x-icon" }
const mediaTypes: Record<string, { kind: "pdf" | "audio" | "video"; mime: string }> = {
  ".pdf": { kind: "pdf", mime: "application/pdf" },
  ".mp3": { kind: "audio", mime: "audio/mpeg" },
  ".wav": { kind: "audio", mime: "audio/wav" },
  ".ogg": { kind: "audio", mime: "audio/ogg" },
  ".m4a": { kind: "audio", mime: "audio/mp4" },
  ".flac": { kind: "audio", mime: "audio/flac" },
  ".mp4": { kind: "video", mime: "video/mp4" },
  ".webm": { kind: "video", mime: "video/webm" },
  ".mov": { kind: "video", mime: "video/quicktime" },
}

function containsBinaryControlCharacter(content: string) {
  for (const character of content) {
    const code = character.charCodeAt(0)

    if (code <= 8 || (code >= 14 && code <= 31)) {
      return true
    }
  }

  return false
}

function assertWithin(root: string, path: string) {
  const child = relative(root, path)

  if (child === ".." || child.startsWith(`..${sep}`) || isAbsolute(child)) {
    throw new Error("Este caminho está fora do Acervo do Bot.")
  }
}

export function createBotArchive(bots: Pick<ReturnType<typeof createBots>, "directory">) {
  async function locate(input: BotArchiveInput) {
    const root = await realpath(await bots.directory(input.botId))
    const path = resolve(root, input.path)
    assertWithin(root, path)
    const resolved = await realpath(path)
    assertWithin(root, resolved)

    return { root, path: resolved }
  }

  return {
    async list(input: BotArchiveInput) {
      const { root, path } = await locate(input)
      const names = await readdir(path)
      const entries = []

      for (const name of names) {
        const child = resolve(path, name)
        const info = await realpath(child).then(async (resolved) => {
          assertWithin(root, resolved)
          return await stat(resolved)
        }).catch(() => null)
        const kind = info?.isDirectory() ? "directory" as const : "file" as const

        entries.push({ name, path: relative(root, resolve(root, input.path, name)).split(sep).join("/"), kind: info && (info.isDirectory() || info.isFile()) ? kind : "unavailable" as const, size: info?.size ?? 0 })
      }

      entries.sort((a, b) => Number(b.kind === "directory") - Number(a.kind === "directory") || a.name.localeCompare(b.name, "pt-BR", { numeric: true }))

      return { directory: path, entries }
    },
    async preview(input: BotArchiveInput) {
      const { path } = await locate(input)
      const info = await stat(path)

      if (!info.isFile()) {
        throw new Error("Escolha um arquivo para visualizar.")
      }

      const extension = extname(path).toLowerCase()
      const mime = imageTypes[extension]
      const media = mediaTypes[extension]
      const limit = mime || media ? 16 * 1024 * 1024 : 1024 * 1024

      if (info.size > limit) {
        return { kind: "unsupported" as const, reason: "Arquivo grande demais para a prévia. Abra no aplicativo padrão." }
      }

      const file = await open(path, "r")
      const buffer = Buffer.alloc(limit + 1)
      let bytesRead: number

      try {
        bytesRead = await file.read(buffer, 0, buffer.length, 0).then((result) => result.bytesRead)
      } finally {
        await file.close()
      }

      if (bytesRead > limit) {
        return { kind: "unsupported" as const, reason: "Arquivo grande demais para a prévia. Abra no aplicativo padrão." }
      }

      const content = buffer.subarray(0, bytesRead)

      if (mime) {
        return { kind: "image" as const, content: `data:${mime};base64,${content.toString("base64")}` }
      }

      if (media) {
        return { kind: media.kind, content: `data:${media.mime};base64,${content.toString("base64")}` }
      }

      const text = (() => {
        try { return new TextDecoder("utf-8", { fatal: true }).decode(content) } catch { return null }
      })()

      if (text === null || containsBinaryControlCharacter(text)) {
        return { kind: "unsupported" as const, reason: "Este formato não tem prévia. Abra no aplicativo padrão." }
      }

      return { kind: "text" as const, content: text }
    },
  }
}
