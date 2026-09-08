import { ArrowTopRightOnSquareIcon, ArchiveBoxIcon, ClipboardDocumentIcon, CodeBracketIcon, DocumentIcon, DocumentTextIcon, EllipsisHorizontalIcon, FolderOpenIcon, LinkIcon, MusicalNoteIcon, PhotoIcon, PresentationChartBarIcon, TableCellsIcon, VideoCameraIcon } from "@heroicons/react/24/outline"
import { createContext, useContext, useState } from "react"
import type { LocalFileRequest } from "@src/shared/local-files"
import { ContextMenu } from "../ui/context-menu"
import { splitFilePaths } from "./chat-file-paths"

export const ChatFileDirectory = createContext<string | undefined>(undefined)

function fileIcon(extension: string) {
  if (/^(md|markdown|txt|pdf|docx?|odt|rtf)$/.test(extension)) { return DocumentTextIcon }
  if (/^(html?|jsonl?|ya?ml|xml)$/.test(extension)) { return CodeBracketIcon }
  if (/^(csv|tsv|xlsx?|ods)$/.test(extension)) { return TableCellsIcon }
  if (/^(pptx?|odp)$/.test(extension)) { return PresentationChartBarIcon }
  if (/^(png|jpe?g|gif|webp|svg|avif)$/.test(extension)) { return PhotoIcon }
  if (/^(mp3|wav|ogg|m4a)$/.test(extension)) { return MusicalNoteIcon }
  if (/^(mp4|webm|mov)$/.test(extension)) { return VideoCameraIcon }
  if (/^(zip|tar|gz|7z)$/.test(extension)) { return ArchiveBoxIcon }

  return DocumentIcon
}

export function ChatFile({ path }: { path: string }) {
  const directory = useContext(ChatFileDirectory)
  const [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(null)
  const [pending, setPending] = useState(false)
  const name = path.split(/[\\/]/).at(-1) ?? path
  const extension = name.split(".").at(-1)?.toLowerCase() ?? ""
  const Icon = fileIcon(extension)
  const remote = window.desktop.remote

  async function run(action: LocalFileRequest["action"]) {
    const copying = action === "copy" || action === "copy-path"

    if (copying) {
      setPending(true)
    }

    setFeedback(null)
    await window.desktop.fileAction({ action, path, ...(directory ? { directory } : {}) }).then(() => {
      if (action === "copy" || action === "copy-path") {
        setFeedback({ text: action === "copy" ? "Arquivo copiado" : "Localização copiada", error: false })
      }
    }).catch((error: unknown) => {
      setFeedback({ text: error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, "") : "Não foi possível acessar o arquivo.", error: true })
    })
    if (copying) {
      setPending(false)
    }
  }

  async function copyPath() {
    if (!remote) {
      await run("copy-path")

      return
    }

    await navigator.clipboard.writeText(path).then(() => setFeedback({ text: "Localização copiada", error: false })).catch(() => setFeedback({ text: "Não foi possível copiar a localização.", error: true }))
  }

  const actions = [
    { label: "Abrir arquivo", icon: <ArrowTopRightOnSquareIcon />, disabled: remote || pending, onSelect: () => void run("open") },
    { label: "Mostrar na pasta", icon: <FolderOpenIcon />, disabled: remote || pending, onSelect: () => void run("reveal") },
    { label: "Copiar arquivo", icon: <ClipboardDocumentIcon />, disabled: remote || pending, onSelect: () => void run("copy") },
    { label: "Copiar localização", icon: <LinkIcon />, disabled: pending, onSelect: () => void copyPath() },
  ]

  return (
    <ContextMenu label={`Ações de ${name}`} actions={actions}>{(openMenu) => <span className="my-1 inline-flex max-w-full flex-col align-middle font-sans text-control font-medium text-primary">
      <span className="inline-flex min-w-0 max-w-full items-stretch rounded-lg border border-outline bg-surface-raised transition-colors hover:border-outline-strong motion-reduce:transition-none" title={path}>
        <button type="button" className="flex min-w-0 items-center gap-2.5 rounded-l-lg px-3 py-2 text-left hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60" aria-label={`Abrir ${name}`} disabled={pending} onClick={remote ? openMenu : () => void run("open")}>
          <Icon className="size-6 shrink-0 text-secondary" aria-hidden="true" />
          <span className="min-w-0"><span className="block truncate">{name}</span><span className="block text-metadata font-normal text-muted">{pending ? "Aguarde…" : extension.toUpperCase()}</span></span>
        </button>
        <button type="button" className="shrink-0 rounded-r-lg px-2 text-muted hover:bg-surface-hover hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" aria-label={`Ações de ${name}`} aria-haspopup="menu" onClick={openMenu}><EllipsisHorizontalIcon className="size-4" aria-hidden="true" /></button>
      </span>
      {remote && <span className="text-metadata font-normal text-muted">Arquivo no computador</span>}
      {feedback && <span className={`max-w-80 text-support font-normal ${feedback.error ? "text-status-error" : "text-secondary"}`} role={feedback.error ? "alert" : "status"}>{feedback.text}</span>}
    </span>}</ContextMenu>
  )
}

export function ChatFileText({ text }: { text: string }) {
  return splitFilePaths(text).map((part, index) => part.path ? <ChatFile key={`${index}-${part.path}`} path={part.path} /> : part.text)
}
