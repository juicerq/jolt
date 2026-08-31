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
    <section className="chat-panel real-chat-panel">
      <button className="chat-settings-button" type="button" aria-label={`Abrir configurações de ${bot.name}`} onClick={onOpenSettings}><Cog6ToothIcon aria-hidden="true" /></button>
      <ChatScroller>
        {isPending && <ChatLoading />}
        {error && <ChatError message={error.message} />}
        {!isPending && !error && messages?.length === 0 && !run && <EmptyChat bot={bot} onDraftChange={(value) => setChatDraft(bot.id, value)} />}
        {messages?.map((message) => <ChatMessage key={message.id} bot={bot} message={message} />)}
        {run && <ChatRun bot={bot} run={run} />}
      </ChatScroller>
      <div className={composerExpanded ? "prompt-bar expanded" : "prompt-bar"}>
        <label htmlFor={`prompt-${bot.id}`}>Mensagem para {bot.name}</label>
        <textarea
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
          ? <button className="stop-button" type="button" disabled={run.status === "aborting"} onClick={handleAbort} aria-label={run.status === "aborting" ? "Interrompendo resposta" : "Interromper resposta"}><StopIcon aria-hidden="true" /></button>
          : <button className="prompt-send-button" type="button" disabled={!draft.trim()} onClick={handleSend} aria-label="Enviar mensagem"><ArrowUpIcon aria-hidden="true" /></button>}
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
    <article className={`chat-message ${message.author}`}>
      <div className="message-meta"><strong>{message.author === "person" ? "Você" : bot.name}</strong><time>{formatMessageTime(message.createdAt)}</time></div>
      <p>{message.content}</p>
    </article>
  )
}

function ChatRun({ bot, run }: { bot: Bot; run: ChatRunState }) {
  return (
    <>
      <article className="chat-message person pending-message"><div className="message-meta"><strong>Você</strong><span>Agora</span></div><p>{run.personContent}</p></article>
      <article className="chat-message bot streaming-message">
        <div className="message-meta"><strong>{bot.name}</strong><span>Agora</span></div>
        {run.tools.length > 0 && <div className="tool-chips" aria-label="Ferramentas usadas">{run.tools.map((tool, index) => <span className={`tool-chip ${tool.status}`} key={`${tool.name}-${index}`}>{tool.status === "running" ? <span className="tool-running-dot" /> : tool.status === "done" ? <CheckIcon aria-hidden="true" /> : <XMarkIcon aria-hidden="true" />}{tool.name}</span>)}</div>}
        {run.responseContent ? <p>{run.responseContent}{run.status !== "failed" && <span className="stream-cursor" aria-hidden="true" />}</p> : run.status !== "failed" && <p className="thinking-label"><span className="thinking-dot running" />{run.status === "aborting" ? "Interrompendo" : "Pensando"}</p>}
        {run.error && <div className="message-error"><div><strong>O bot parou</strong><p>{run.error}</p></div><button type="button" onClick={() => dismissChatRun(bot.id)}>Fechar</button></div>}
      </article>
    </>
  )
}

function EmptyChat({ bot, onDraftChange }: { bot: Bot; onDraftChange: (value: string) => void }) {
  return (
    <div className="chat-empty">
      <Blobatar className="bot-avatar large" name={`jots:${bot.id}:${bot.name}`} size={40} alt="" />
      <h2>Converse com {bot.name}</h2>
      <p>{bot.function.outcome}</p>
      <div><button type="button" onClick={() => onDraftChange("O que você recomenda fazer primeiro?")}>Pedir recomendação</button><button type="button" onClick={() => onDraftChange("Resuma o estado atual do seu trabalho.")}>Pedir resumo</button></div>
    </div>
  )
}

function ChatLoading() {
  return <div className="chat-state" aria-label="Carregando conversa"><span /><span /><span /></div>
}

function ChatError({ message }: { message: string }) {
  return <div className="chat-state error"><strong>Não foi possível abrir a conversa</strong><span>{message}</span></div>
}

function formatMessageTime(createdAt: string) {
  const timestamp = Date.parse(createdAt)

  if (Number.isNaN(timestamp)) {
    return createdAt
  }

  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(timestamp)
}
