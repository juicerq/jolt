import { ArrowTopRightOnSquareIcon, ArchiveBoxIcon, ClipboardDocumentIcon, CodeBracketIcon, DocumentIcon, DocumentTextIcon, FolderOpenIcon, LinkIcon, MusicalNoteIcon, PhotoIcon, PresentationChartBarIcon, TableCellsIcon, VideoCameraIcon, XMarkIcon } from "@heroicons/react/24/outline"
import { useQuery } from "@tanstack/react-query"
import { createContext, useContext, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
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

export function ChatFile({ path, children }: { path: string; children: ReactNode }) {
  const directory = useContext(ChatFileDirectory)
  const { data, isError } = useQuery({
    queryKey: ["local-file", directory, path],
    queryFn: async () => await window.desktop.resolveFile({ path, ...(directory ? { directory } : {}) }),
    enabled: !window.desktop.remote,
    retry: false,
  })

  if (!data || isError || window.desktop.remote) {
    return children
  }

  return <ChatFileButton key={data} path={data} />
}

function ChatFileButton({ path }: { path: string }) {
  const [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(null)
  const [pending, setPending] = useState(false)
  const name = path.split(/[\\/]/).at(-1) ?? path
  const extension = name.split(".").at(-1)?.toLowerCase() ?? ""
  const Icon = fileIcon(extension)

  async function run(action: LocalFileRequest["action"]) {
    const copying = action === "copy" || action === "copy-path"

    if (copying) {
      setPending(true)
    }

    setFeedback(null)
    await window.desktop.fileAction({ action, path }).then(() => {
      if (action === "copy" || action === "copy-path") {
        setFeedback({ text: action === "copy" ? "Arquivo copiado" : "Localização copiada", error: false })
      }
    }).catch((error: unknown) => {
      if (!(error instanceof Error)) {
        setFeedback({ text: "Não foi possível acessar o arquivo.", error: true })

        return
      }

      const text = error.message.includes("reply was never sent")
        ? "O aplicativo não respondeu. Tente novamente."
        : error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "")

      setFeedback({ text, error: true })
    })
    if (copying) {
      setPending(false)
    }
  }

  const actions = [
    { label: "Abrir arquivo", icon: <ArrowTopRightOnSquareIcon />, disabled: pending, onSelect: () => void run("open") },
    { label: "Mostrar na pasta", icon: <FolderOpenIcon />, disabled: pending, onSelect: () => void run("reveal") },
    { label: "Copiar arquivo", icon: <ClipboardDocumentIcon />, disabled: pending, onSelect: () => void run("copy") },
    { label: "Copiar localização", icon: <LinkIcon />, disabled: pending, onSelect: () => void run("copy-path") },
  ]

  return (
    <>
      <ContextMenu label={`Ações de ${name}`} actions={actions}>{() => <button
        type="button"
        className="inline-flex max-w-[min(100%,16rem)] items-center gap-1 align-baseline rounded-sm font-sans font-normal text-secondary hover:text-primary active:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60"
        title={path}
        aria-label={`Abrir ${name}`}
        aria-busy={pending}
        disabled={pending}
        onClick={() => void run("open")}
      >
        <Icon className="size-3.5 shrink-0 self-center" aria-hidden="true" />
        <span className="truncate underline decoration-outline-strong underline-offset-3">{name}</span>
      </button>}</ContextMenu>
      {feedback && createPortal(<div
        popover="auto"
        ref={(element) => { element?.showPopover() }}
        onToggle={(event) => {
          if (event.newState === "closed") {
            setFeedback(null)
          }
        }}
        className="fixed inset-auto right-4 bottom-4 m-0 max-h-[calc(100dvh-2rem)] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border border-outline bg-surface-raised p-3 font-sans text-support text-primary shadow-lg"
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1" role={feedback.error ? "alert" : "status"}>
            <p className="truncate font-medium" title={path}>{name}</p>
            <p className={`mt-1 wrap-anywhere ${feedback.error ? "text-status-error" : "text-secondary"}`}>{feedback.text}</p>
          </div>
          <button type="button" aria-label="Fechar aviso" className="shrink-0 rounded-sm p-1 text-secondary hover:bg-surface-hover hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" onClick={() => setFeedback(null)}>
            <XMarkIcon className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>, document.body)}
    </>
  )
}

export function ChatFileText({ text }: { text: string }) {
  return splitFilePaths(text).map((part, index) => part.path ? <ChatFile key={`${index}-${part.path}`} path={part.path}>{part.text}</ChatFile> : part.text)
}
