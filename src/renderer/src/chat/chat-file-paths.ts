// Bare names are recognized for documents; other types need an explicit path.
const extensions = "md|markdown|html?|txt|json|jsonl|csv|tsv|pdf|docx?|odt|rtf|xlsx?|ods|pptx?|odp|ya?ml|xml|png|jpe?g|gif|webp|svg|avif|mp3|wav|ogg|m4a|mp4|webm|mov|zip|tar|gz|7z"
const documentFile = new RegExp(`\\.(?:${extensions})$`, "i")
const pathPattern = new RegExp(`(?<![\\p{L}\\p{N}_.:/\\\\-])(?:file:\\/\\/\\/|[A-Za-z]:[\\\\/]|~\\/|\\.{1,2}\\/|[\\p{L}\\p{N}_-][\\p{L}\\p{N}_.-]*\\/|\\/)[^<>"\\p{Cc}\\x60|]*?\\.[a-z][a-z0-9]{0,11}(?=$|[\\s,;!?"')\\]}]|[.:](?=\\s|$))`, "giu")

export function conversationFilePath(value: string) {
  const path = value.trim()

  if (!/\.[a-z][a-z0-9]{0,11}$/i.test(path) || (!/[\\/]/.test(path) && !documentFile.test(path)) || /[\r\n\0]/.test(path) || /^(?!file:|[a-z]:[\\/])[a-z][a-z\d+.-]*:/i.test(path)) {
    return
  }

  if (path.startsWith("file:")) {
    try {
      const url = new URL(path)

      if (url.hostname && url.hostname !== "localhost") {
        return
      }

      const decoded = decodeURIComponent(url.pathname)

      if (/^\/[A-Za-z]:\//.test(decoded)) {
        return decoded.slice(1)
      }

      return decoded
    } catch {
      return
    }
  }

  if (/\s/.test(path) && !/^(?:\/|~\/|\.{1,2}\/|[A-Za-z]:[\\/])/.test(path)) {
    return
  }

  return path
}

export function splitFilePaths(text: string) {
  const parts: { text: string; path?: string }[] = []
  let start = 0

  for (const match of text.matchAll(pathPattern)) {
    const path = conversationFilePath(match[0])

    if (!path) {
      continue
    }

    parts.push({ text: text.slice(start, match.index) }, { text: match[0], path })
    start = match.index + match[0].length
  }

  parts.push({ text: text.slice(start) })

  return parts
}
