import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createContext, useContext, useState, type MouseEvent } from "react"
import type { BotArchiveEntry } from "@src/shared/bot-archive"
import type { EngineClient } from "../engine-client"
import { createMarkdownRenderer } from "../chat/chat-markdown"

interface ArchiveContentProps {
  client: EngineClient
  botId: string
  path: string
  content: string
  onSelect: (entry: BotArchiveEntry) => void
}

const archiveContext = createContext<ArchiveContentProps | null>(null)

/** Resolve document references without turning external URLs into local file requests. */
function archiveReference(path: string, reference: string) {
  if (!reference || reference.startsWith("#") || reference.startsWith("//") || /^[a-z][a-z\d+.-]*:/i.test(reference)) {
    return
  }

  try {
    const parts = reference.startsWith("/") ? [] : path.split("/").slice(0, -1)

    for (const part of decodeURIComponent(reference.split(/[?#]/)[0] ?? "").split("/")) {
      if (part === "..") {
        if (!parts.length) { return }
        parts.pop()
      } else if (part && part !== ".") { parts.push(part) }
    }

    return parts.join("/")
  } catch {
    return
  }
}

function ArchiveMarkdownImage({ src, alt }: { src?: string; alt?: string }) {
  const archive = useContext(archiveContext)
  const path = archive && src ? archiveReference(archive.path, src) : undefined

  if (archive && path !== undefined) {
    return <ArchiveReferencedImage client={archive.client} botId={archive.botId} path={path} alt={alt ?? ""} />
  }

  return <img src={src} alt={alt ?? ""} className="my-4 max-h-[60vh] max-w-full rounded-sm object-contain" />
}

function ArchiveReferencedImage({ client, botId, path, alt }: { client: EngineClient; botId: string; path: string; alt: string }) {
  const { data, isPending } = useQuery(client.query.archive.preview.queryOptions({ input: { botId, path }, gcTime: 0 }))

  if (isPending) { return <span role="status" className="block py-4 text-support text-secondary">Carregando imagem…</span> }
  if (data?.kind !== "image") { return <span className="block py-4 text-support text-secondary">Imagem indisponível: {alt || path}</span> }

  return <img src={data.content} alt={alt} className="my-4 max-h-[60vh] max-w-full rounded-sm object-contain" />
}

const markdown = createMarkdownRenderer({
  cacheBytes: 1_000_000,
  detectFiles: false,
  components: {
    img: ({ src, alt }) => <ArchiveMarkdownImage src={typeof src === "string" ? src : undefined} alt={alt} />,
    a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>,
    table: ({ children }) => <div className="my-4 overflow-x-auto"><table>{children}</table></div>,
  },
})

export function ArchiveMarkdown(props: ArchiveContentProps) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string>()

  async function openLink(event: MouseEvent<HTMLElement>) {
    const link = event.target instanceof Element ? event.target.closest("a") : null
    const href = link?.getAttribute("href")
    const path = href ? archiveReference(props.path, href) : undefined

    if (path === undefined) { return }

    event.preventDefault()
    setError(undefined)
    const listing = await queryClient.fetchQuery(props.client.query.archive.list.queryOptions({ input: { botId: props.botId, path: path.split("/").slice(0, -1).join("/") } })).catch(() => null)
    const entry = listing?.entries.find((candidate) => candidate.path === path)

    if (!entry || entry.kind === "unavailable") {
      setError("Não foi possível abrir este arquivo no Acervo.")
      return
    }

    props.onSelect(entry)
  }

  return <archiveContext.Provider value={props}>
    <article className="archive-markdown mx-auto w-full max-w-3xl p-6 text-body text-primary max-md:p-4" onClick={(event) => void openLink(event)}>{markdown.render(props.content)}{error && <p role="alert" className="text-support text-status-error">{error}</p>}</article>
  </archiveContext.Provider>
}

// srcdoc runs in an opaque-origin sandbox. Assets arrive through the authenticated
// archive API and become data URLs; the document never receives the Engine token.
export async function archiveHtml({ client, botId, path, content }: Omit<ArchiveContentProps, "onSelect">) {
  const document = new DOMParser().parseFromString(content, "text/html")
  document.querySelectorAll("base, meta[http-equiv]").forEach((node) => node.remove())
  const policy = document.createElement("meta")
  policy.httpEquiv = "Content-Security-Policy"
  policy.content = "default-src 'none'; script-src 'unsafe-inline' data: https: http:; style-src 'unsafe-inline' data: https: http:; img-src data: https: http:; font-src data: https: http:; media-src data: https: http:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"
  document.head.prepend(policy)
  const assets = new Map<string, Promise<string>>()
  const missing = new Set<string>()

  async function asset(reference: string, from: string, mime: string) {
    const relative = archiveReference(from, reference)

    if (relative === undefined) { return reference }
    if (relative === from) { return "" }

    const key = `${mime}:${relative}`

    if (!assets.has(key)) {
      if (assets.size >= 64) {
        missing.add(relative)
        return ""
      }

      assets.set(key, client.raw.archive.preview({ botId, path: relative }).then(async (preview) => {
        if (preview.kind === "image" || preview.kind === "audio" || preview.kind === "video") { return preview.content }
        if (preview.kind !== "text") {
          missing.add(relative)
          return ""
        }

        const text = mime === "text/css" ? await stylesheet(preview.content, relative) : preview.content

        return `data:${mime};charset=utf-8,${encodeURIComponent(text)}`
      }).catch(() => {
        missing.add(relative)
        return ""
      }))
    }

    return await assets.get(key) ?? ""
  }

  async function stylesheet(css: string, from: string) {
    const matches = [...css.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/g)]
    const replacements = await Promise.all(matches.map(async (match) => `url("${await asset(match[2] ?? "", from, "application/octet-stream")}")`))
    let index = 0

    return css.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/g, () => replacements[index++] ?? "")
  }

  await Promise.all([
    ...[...document.querySelectorAll("img[src], script[src], link[rel=stylesheet][href]")].map(async (element) => {
      const attribute = element.tagName === "LINK" ? "href" : "src"
      const mime = element.tagName === "LINK" ? "text/css" : "text/javascript"
      element.setAttribute(attribute, await asset(element.getAttribute(attribute) ?? "", path, mime))
    }),
    ...[...document.querySelectorAll("style")].map(async (element) => { element.textContent = await stylesheet(element.textContent, path) }),
    ...[...document.querySelectorAll("[style]")].map(async (element) => { element.setAttribute("style", await stylesheet(element.getAttribute("style") ?? "", path)) }),
  ])

  return { content: `<!doctype html>\n${document.documentElement.outerHTML}`, missing: [...missing] }
}
