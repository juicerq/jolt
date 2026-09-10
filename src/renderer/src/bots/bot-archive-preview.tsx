import { ArrowTopRightOnSquareIcon, CodeBracketIcon, EyeIcon, FolderOpenIcon, XMarkIcon } from "@heroicons/react/24/outline"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useState } from "react"
import type { BotArchiveEntry, BotArchivePreview } from "@src/shared/bot-archive"
import type { LocalFileRequest } from "@src/shared/local-files"
import type { EngineClient } from "../engine-client"
import { Button } from "../ui/button"
import { IconButton } from "../ui/icon-button"
import { ArchiveMarkdown, archiveHtml } from "./bot-archive-content"

interface ArchivePreviewProps {
  client: EngineClient
  botId: string
  entry: BotArchiveEntry
  directory: string
  onSelect: (entry: BotArchiveEntry) => void
  onClose: () => void
}

function fileSize(bytes: number) {
  if (bytes < 1024) { return `${bytes} B` }
  if (bytes < 1024 * 1024) { return `${(bytes / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} KB` }

  return `${(bytes / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`
}

export function BotArchivePreview({ client, botId, entry, directory, onSelect, onClose }: ArchivePreviewProps) {
  const [source, setSource] = useState(false)
  const { data, error, isPending } = useQuery(client.query.archive.preview.queryOptions({ input: { botId, path: entry.path }, gcTime: 0, staleTime: 0 }))
  const { mutate: act, isPending: opening, error: actionError } = useMutation({ mutationFn: async (action: LocalFileRequest["action"]) => await window.desktop.fileAction({ action, path: entry.path, directory }) })
  const formatted = data?.kind === "text" && /\.(md|markdown|html?)$/i.test(entry.name)

  return <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" aria-label={`Prévia de ${entry.name}`}>
    <header className="flex shrink-0 flex-col gap-3 border-b border-outline p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="m-0 wrap-anywhere text-section font-semibold text-primary">{entry.name}</h3>
          <p className="m-0 mt-1 truncate text-support text-secondary" title={entry.path}>{entry.path}</p>
        </div>
        {!window.desktop.remote && <div className="flex shrink-0 items-center gap-1">
          <IconButton label="Abrir no aplicativo padrão" disabled={opening} onClick={() => act("open")}><ArrowTopRightOnSquareIcon aria-hidden="true" /></IconButton>
          <IconButton label="Mostrar na pasta" disabled={opening} onClick={() => act("reveal")}><FolderOpenIcon aria-hidden="true" /></IconButton>
        </div>}
        <IconButton label="Fechar prévia" onClick={onClose}><XMarkIcon aria-hidden="true" /></IconButton>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {formatted && <div className="flex items-center gap-1 rounded-sm bg-surface p-1" role="group" aria-label="Modo de visualização">
          <Button variant="text" aria-pressed={!source} className={`inline-flex items-center gap-2 ${!source ? "bg-surface-active text-primary" : ""}`} onClick={() => setSource(false)}><EyeIcon className="size-4" aria-hidden="true" />Visualização</Button>
          <Button variant="text" aria-pressed={source} className={`inline-flex items-center gap-2 ${source ? "bg-surface-active text-primary" : ""}`} onClick={() => setSource(true)}><CodeBracketIcon className="size-4" aria-hidden="true" />Código</Button>
        </div>}
        <span className="ml-auto text-metadata text-muted tabular-nums">{fileSize(entry.size)}</span>
      </div>
      {actionError && <p role="alert" className="m-0 text-support text-status-error">{actionError.message}</p>}
    </header>
    <div className="flex min-h-0 flex-1 flex-col overflow-auto overscroll-contain">
      {isPending && <p role="status" className="p-6 text-support text-secondary">Carregando prévia…</p>}
      {error && <p role="alert" className="p-6 text-support text-status-error">Não foi possível visualizar: {error.message}</p>}
      {data && <ArchivePreviewContent client={client} botId={botId} entry={entry} data={data} source={source} onSelect={onSelect} />}
    </div>
  </section>
}

function ArchivePreviewContent({ client, botId, entry, data, source, onSelect }: Pick<ArchivePreviewProps, "client" | "botId" | "entry" | "onSelect"> & { data: BotArchivePreview; source: boolean }) {
  if (data.kind === "unsupported") { return <p className="m-0 p-6 text-support text-secondary">{data.reason}</p> }
  if (data.kind === "image") { return <ArchiveImagePreview name={entry.name} content={data.content} /> }
  if (data.kind === "pdf") { return <iframe title={`Visualização de ${entry.name}`} src={data.content} className="min-h-0 w-full flex-1 border-0" /> }
  if (data.kind === "audio" || data.kind === "video") { return <ArchiveMediaPreview name={entry.name} content={data.content} kind={data.kind} /> }
  if (!data.content) { return <p className="m-0 p-6 text-support text-secondary">Arquivo vazio.</p> }
  if (!source && /\.(md|markdown)$/i.test(entry.name)) { return <ArchiveMarkdown client={client} botId={botId} path={entry.path} content={data.content} onSelect={onSelect} /> }
  if (!source && /\.html?$/i.test(entry.name)) { return <ArchiveHtmlPreview client={client} botId={botId} path={entry.path} content={data.content} name={entry.name} /> }

  return <pre className="m-0 min-h-full whitespace-pre-wrap wrap-anywhere p-6 font-mono text-support text-secondary max-md:p-4">{data.content || "Arquivo vazio."}</pre>
}

function ArchiveMediaPreview({ name, content, kind }: { name: string; content: string; kind: "audio" | "video" }) {
  const [failed, setFailed] = useState(false)
  const Media = kind

  return <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-4">
    <Media controls preload="metadata" src={content} aria-label={name} className="max-h-full w-full" onError={() => setFailed(true)} />
    {failed && <p role="alert" className="text-support text-status-error">Não foi possível reproduzir este arquivo. Tente abrir no aplicativo padrão.</p>}
  </div>
}

function ArchiveImagePreview({ name, content }: { name: string; content: string }) {
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)

  return <div className="relative flex min-h-40 flex-1 items-center justify-center p-4">
    {!loaded && !failed && <p role="status" className="absolute text-support text-secondary">Carregando imagem…</p>}
    <img className={`absolute inset-4 h-[calc(100%-2rem)] w-[calc(100%-2rem)] rounded-sm object-contain transition-opacity duration-150 motion-reduce:transition-none ${loaded ? "opacity-100" : "opacity-0"}`} src={content} alt={name} onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />
    {failed && <p role="alert" className="m-0 text-support text-status-error">Não foi possível exibir esta imagem. Tente abrir no aplicativo padrão.</p>}
  </div>
}

function ArchiveHtmlPreview({ client, botId, path, content, name }: { client: EngineClient; botId: string; path: string; content: string; name: string }) {
  const { data, isPending, error } = useQuery({
    queryKey: [...client.query.archive.preview.queryOptions({ input: { botId, path } }).queryKey, { format: "html", content }],
    queryFn: async () => await archiveHtml({ client, botId, path, content }),
    gcTime: 0,
  })

  if (isPending) { return <p role="status" className="p-6 text-support text-secondary">Carregando página…</p> }
  if (error) { return <p role="alert" className="p-6 text-support text-status-error">Não foi possível renderizar esta página.</p> }

  return <>
    {!!data?.missing.length && <p role="status" className="m-0 px-4 py-2 text-support text-secondary">Alguns arquivos desta página não puderam ser carregados: {data.missing.join(", ")}.</p>}
    <iframe title={`Visualização de ${name}`} sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={data?.content} className="min-h-0 w-full flex-1 border-0 bg-white" />
  </>
}
