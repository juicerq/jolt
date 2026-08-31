import { Blobatar } from "@blobatar/react"
import { ArrowUpIcon, CheckIcon, Cog6ToothIcon, StopIcon, XMarkIcon } from "@heroicons/react/24/outline"
import { consumeEventIterator } from "@orpc/client"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useSelector } from "@tanstack/react-store"
import { type KeyboardEvent, useCallback, useRef, useState } from "react"
import type { Bot } from "../../../shared/bots"
import type { ConversationEvent, ConversationMessage } from "../../../shared/conversations"
import type { EngineClient } from "../engine-client"
import {
  appendChatText,
  chatStore,
  dismissChatRun,
  failChatRun,
  finishChatTool,
  markChatAborting,
  restartChatRun,
  setChatDraft,
  settleChatRun,
  startChatRun,
  startChatTool,
  type ChatRun as ChatRunState,
} from "./chat-store"
import { ChatScroller } from "./chat-scroller"

type ToolStatus = ChatRunState["tools"][number]["status"]

const toolStatusClassNames: Record<ToolStatus, string> = {
  running: "border-[color-mix(in_oklch,var(--color-status-working)_35%,transparent)] text-status-working",
  done: "border-[color-mix(in_oklch,var(--color-status-success)_35%,transparent)] text-status-success",
  failed: "border-[color-mix(in_oklch,var(--color-status-error)_35%,transparent)] text-status-error",
}

export function ChatWorkspace({ bot, client, onOpenSettings }: { bot: Bot; client: EngineClient; onOpenSettings: () => void }) {
  const queryClient = useQueryClient()
  const draft = useSelector(chatStore, (state) => state.drafts[bot.id] ?? "")
  const run = useSelector(chatStore, (state) => state.runs[bot.id])
  const [composerExpanded, setComposerExpanded] = useState(false)
  const composerObserverRef = useRef<ResizeObserver | null>(null)
  const historyOptions = client.query.conversations.history.queryOptions({ input: { botId: bot.id } })
  const { data: messages, error, isPending } = useQuery(historyOptions)
  const { mutateAsync: abort } = useMutation(client.query.conversations.abort.mutationOptions())

  const attachComposer = useCallback((composer: HTMLTextAreaElement | null) => {
    composerObserverRef.current?.disconnect()

    if (!composer) {
      return
    }

    const element = composer

    function updateComposerLayout() {
      const styles = getComputedStyle(element)
      const contentHeight = element.clientHeight - Number.parseFloat(styles.paddingTop) - Number.parseFloat(styles.paddingBottom)
      const lineHeight = Number.parseFloat(styles.lineHeight)

      setComposerExpanded(contentHeight > lineHeight * 1.5)
    }

    composerObserverRef.current = new ResizeObserver(updateComposerLayout)
    composerObserverRef.current.observe(element)
    updateComposerLayout()
  }, [])

  async function refreshHistory(status: "available" | "completed") {
    await queryClient.invalidateQueries({ queryKey: historyOptions.queryKey })
    settleChatRun(bot.id, status)
  }

  async function handleSend() {
    const content = draft.trim()

    if (!content || run) {
      return
    }

    startChatRun(bot.id, content)

    let finishReason: "stop" | "aborted" | "error" = "stop"

    try {
      const iterator = client.raw.conversations.send({ botId: bot.id, content })

      consumeEventIterator(iterator, {
        onEvent: (event) => {
          if (event.type === "finished") {
            finishReason = event.reason
            return
          }

          handleConversationEvent(bot.id, event)
        },
        onError: (sendError) => failChatRun(bot.id, sendError instanceof Error ? sendError.message : "Não foi possível responder"),
        onSuccess: () => {
          if (finishReason === "error") {
            failChatRun(bot.id, "O bot não conseguiu concluir a resposta")
            return
          }

          refreshHistory(finishReason === "stop" ? "completed" : "available")
        },
      })
    } catch (sendError) {
      failChatRun(bot.id, sendError instanceof Error ? sendError.message : "Não foi possível responder")
    }
  }

  async function handleAbort() {
    if (!run || run.status === "aborting") {
      return
    }

    markChatAborting(bot.id)
    await abort({ botId: bot.id }).catch((abortError: unknown) => {
      failChatRun(bot.id, abortError instanceof Error ? abortError.message : "Não foi possível interromper")
    })
  }

  function handleComposerKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return
    }

    event.preventDefault()
    handleSend()
  }

  return (
    <section className="relative grid h-full min-h-0 min-w-0 grid-rows-[minmax(0,1fr)] overflow-hidden bg-surface before:pointer-events-none before:absolute before:top-0 before:right-2 before:left-px before:z-[1] before:h-[88px] before:rounded-tl-[23px] before:bg-[color-mix(in_srgb,var(--color-surface)_52%,transparent)] before:backdrop-blur-[10px] before:[clip-path:inset(0_round_23px_0_0)] before:[mask-image:linear-gradient(to_bottom,#000_0%,#000_42%,transparent_100%)]">
      <button className="absolute top-6 right-[clamp(20px,4vw,48px)] z-[2] grid size-[30px] place-items-center rounded-lg bg-transparent p-0 text-muted hover:bg-surface-hover hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [&_svg]:size-[17px]" type="button" aria-label={`Abrir configurações de ${bot.name}`} onClick={onOpenSettings}><Cog6ToothIcon aria-hidden="true" /></button>
      <ChatScroller>
        {isPending && <ChatLoading />}
        {error && <ChatError message={error.message} />}
        {!isPending && !error && messages?.length === 0 && !run && <EmptyChat bot={bot} onDraftChange={(value) => setChatDraft(bot.id, value)} />}
        {messages?.map((message) => <ChatMessage key={message.id} bot={bot} message={message} />)}
        {run && <ChatRun bot={bot} run={run} />}
      </ChatScroller>
      <div className={`z-[1] col-start-1 row-start-1 mb-[22px] grid w-[min(680px,calc(100%-48px))] box-border self-end justify-self-center grid-cols-[minmax(0,1fr)_auto] items-end gap-2 border border-outline-strong bg-surface-raised px-2 py-[7px] shadow-[0_14px_32px_rgb(0_0_0_/_24%)] focus-within:border-muted max-[700px]:w-[calc(100%-28px)] ${composerExpanded ? "grid-rows-[auto_auto] gap-y-1 rounded-[18px]" : "rounded-full"}`}>
        <label className="sr-only" htmlFor={`prompt-${bot.id}`}>Mensagem para {bot.name}</label>
        <textarea
          className={`field-sizing-content box-border max-h-40 resize-none overflow-y-auto rounded-lg border-0 bg-transparent text-body text-primary placeholder:text-muted disabled:opacity-60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${composerExpanded ? "col-span-full min-h-[25px] py-0 pr-[46px] pl-1" : "min-h-[34px] px-1 py-2"}`}
          id={`prompt-${bot.id}`}
          placeholder={`Converse com ${bot.name}...`}
          value={draft}
          rows={1}
          ref={attachComposer}
          disabled={!!run}
          onChange={(event) => setChatDraft(bot.id, event.target.value)}
          onKeyDown={handleComposerKey}
        />
        {run
          ? <button className={`inline-flex size-[34px] items-center justify-center rounded-full border border-outline-strong bg-transparent p-0 text-status-error hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60 [&_svg]:size-3.5 ${composerExpanded ? "col-start-2 row-start-2" : ""}`} type="button" disabled={run.status === "aborting"} onClick={handleAbort} aria-label={run.status === "aborting" ? "Interrompendo resposta" : "Interromper resposta"}><StopIcon aria-hidden="true" /></button>
          : <button className={`grid size-[34px] place-items-center rounded-full bg-accent p-0 text-accent-ink hover:bg-primary active:scale-96 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60 [&_svg]:size-[17px] [&_svg]:stroke-2 ${composerExpanded ? "col-start-2 row-start-2" : ""}`} type="button" disabled={!draft.trim()} onClick={handleSend} aria-label="Enviar mensagem"><ArrowUpIcon aria-hidden="true" /></button>}
      </div>
    </section>
  )
}

function handleConversationEvent(botId: string, event: ConversationEvent) {
  if (event.type === "started") {
    restartChatRun(botId)
    return
  }

  if (event.type === "text") {
    appendChatText(botId, event.text)
    return
  }

  if (event.type === "tool-started") {
    startChatTool(botId, event.tool)
    return
  }

  if (event.type === "tool-finished") {
    finishChatTool(botId, event.tool, event.failed)
  }
}

function ChatMessage({ bot, message }: { bot: Bot; message: ConversationMessage }) {
  return (
    <article className={`group relative max-w-[720px] ${message.author === "person" ? "max-w-[min(640px,84%)] self-end rounded-[16px_16px_4px_16px] bg-surface-active px-4 py-3" : ""}`}>
      <div className="pointer-events-none absolute -top-5 left-0 flex items-center justify-start gap-3 text-metadata font-medium text-muted opacity-0 transition-opacity duration-150 ease-out motion-reduce:transition-none group-hover:opacity-100 group-focus-within:opacity-100"><strong className="font-semibold text-secondary">{message.author === "person" ? "Você" : bot.name}</strong><time>{formatMessageTime(message.createdAt)}</time></div>
      <p className="m-0 whitespace-pre-wrap text-body text-primary">{message.content}</p>
    </article>
  )
}

function ChatRun({ bot, run }: { bot: Bot; run: ChatRunState }) {
  return (
    <>
      <article className="group relative max-w-[min(640px,84%)] self-end rounded-[16px_16px_4px_16px] bg-surface-active px-4 py-3 opacity-70"><div className="pointer-events-none absolute -top-5 left-0 flex items-center gap-3 text-metadata text-muted opacity-0 transition-opacity duration-150 motion-reduce:transition-none group-hover:opacity-100 group-focus-within:opacity-100"><strong className="font-semibold text-secondary">Você</strong><span>Agora</span></div><p className="m-0 whitespace-pre-wrap text-body text-primary">{run.personContent}</p></article>
      <article className="group relative max-w-[720px]">
        <div className="pointer-events-none absolute -top-5 left-0 flex items-center gap-3 text-metadata text-muted opacity-0 transition-opacity duration-150 motion-reduce:transition-none group-hover:opacity-100 group-focus-within:opacity-100"><strong className="font-semibold text-secondary">{bot.name}</strong><span>Agora</span></div>
        {run.tools.length > 0 && <div className="mt-2.5 flex flex-wrap gap-1.5" aria-label="Ferramentas usadas">{run.tools.map((tool, index) => <span className={`inline-flex items-center gap-1 rounded-full border bg-surface-raised px-[9px] py-[5px] text-metadata ${toolStatusClassNames[tool.status]} [&_svg]:size-3 [&_svg]:stroke-2`} key={`${tool.name}-${index}`}><ToolStatusIcon status={tool.status} />{tool.name}</span>)}</div>}
        {run.responseContent ? <p className="m-0 whitespace-pre-wrap text-body text-primary">{run.responseContent}{run.status !== "failed" && <span className="ml-[3px] inline-block h-[15px] w-1.5 animate-pulse bg-accent align-text-bottom [animation-duration:900ms] motion-reduce:animate-none" aria-hidden="true" />}</p> : run.status !== "failed" && <p className="m-0 flex items-center gap-2 text-support text-muted"><span className="size-1.5 animate-pulse rounded-full bg-accent [animation-duration:900ms] motion-reduce:animate-none" />{run.status === "aborting" ? "Interrompendo" : "Pensando"}</p>}
        {run.error && <div className="mt-3.5 flex items-center gap-3 rounded-xl border border-[color-mix(in_srgb,var(--color-status-error)_45%,transparent)] bg-[color-mix(in_srgb,var(--color-status-error)_10%,var(--color-surface))] p-3 max-[700px]:flex-wrap max-[700px]:items-start"><div className="min-w-0 flex-1"><strong className="text-control font-semibold text-primary">O bot parou</strong><p className="mt-[3px] mb-0 text-support text-secondary">{run.error}</p></div><button className="flex-none rounded-lg border border-outline-strong bg-transparent px-3 py-2 text-metadata font-medium text-secondary hover:bg-surface-hover hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" type="button" onClick={() => dismissChatRun(bot.id)}>Fechar</button></div>}
      </article>
    </>
  )
}

function ToolStatusIcon({ status }: { status: ToolStatus }) {
  if (status === "running") {
    return <span className="size-[5px] rounded-full bg-current" />
  }

  if (status === "done") {
    return <CheckIcon aria-hidden="true" />
  }

  return <XMarkIcon aria-hidden="true" />
}

function EmptyChat({ bot, onDraftChange }: { bot: Bot; onDraftChange: (value: string) => void }) {
  return (
    <div className="m-auto flex max-w-[520px] flex-col items-center text-center text-support text-secondary">
      <Blobatar className="size-10 flex-none rounded-xl border border-outline-strong bg-surface-raised" name={`jots:${bot.id}:${bot.name}`} size={40} alt="" />
      <h2 className="mt-4 mb-1.5 text-title font-semibold text-primary">Converse com {bot.name}</h2>
      <p className="max-w-[48ch] text-support leading-[1.6]">{bot.function.outcome}</p>
      <div className="flex flex-wrap justify-center gap-2"><button className="rounded-lg border border-outline-strong bg-surface-raised px-3 py-2 text-control font-medium text-secondary hover:bg-surface-hover hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" type="button" onClick={() => onDraftChange("O que você recomenda fazer primeiro?")}>Pedir recomendação</button><button className="rounded-lg border border-outline-strong bg-surface-raised px-3 py-2 text-control font-medium text-secondary hover:bg-surface-hover hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" type="button" onClick={() => onDraftChange("Resuma o estado atual do seu trabalho.")}>Pedir resumo</button></div>
    </div>
  )
}

function ChatLoading() {
  return <div className="flex min-h-[220px] items-center justify-center gap-[7px] text-muted" aria-label="Carregando conversa"><span className="size-1.5 animate-pulse rounded-full bg-secondary [animation-duration:900ms] motion-reduce:animate-none" /><span className="size-1.5 animate-pulse rounded-full bg-secondary [animation-delay:150ms] [animation-duration:900ms] motion-reduce:animate-none" /><span className="size-1.5 animate-pulse rounded-full bg-secondary [animation-delay:300ms] [animation-duration:900ms] motion-reduce:animate-none" /></div>
}

function ChatError({ message }: { message: string }) {
  return <div className="flex min-h-[220px] flex-col items-center justify-center gap-[7px] text-center text-muted"><strong className="text-section font-semibold text-primary">Não foi possível abrir a conversa</strong><span className="text-support text-secondary">{message}</span></div>
}

function formatMessageTime(createdAt: string) {
  const timestamp = Date.parse(createdAt)

  if (Number.isNaN(timestamp)) {
    return createdAt
  }

  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(timestamp)
}
