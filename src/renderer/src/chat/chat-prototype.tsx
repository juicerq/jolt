import { Blobatar } from "@blobatar/react"
import { ArrowTopRightOnSquareIcon, ArrowUpIcon, CheckIcon, Cog6ToothIcon, PlusIcon, StopIcon, XMarkIcon } from "@heroicons/react/24/outline"
import { type FormEvent, type KeyboardEvent, useRef, useState } from "react"
import { fakeReply, initialMessages, prototypeSessions, statusLabels, type PrototypeBot, type PrototypeMessage, type PrototypeSession } from "./chat-prototype-data"

const statusDotClassNames: Record<PrototypeBot["status"], string> = {
  idle: "bg-muted",
  working: "bg-status-working",
  waiting: "bg-status-warning",
  done: "bg-status-success",
  error: "bg-status-error",
}

export function ChatPrototype() {
  const [sessions, setSessions] = useState(prototypeSessions)
  const [selectedBotId, setSelectedBotId] = useState("leader")
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [messages, setMessages] = useState(initialMessages)
  const [creatorMode, setCreatorMode] = useState<"bot" | "member">()
  const [showFunction, setShowFunction] = useState(false)
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const allBots = sessions.flatMap((session) => [session.bot, ...session.members])
  const selectedBot = allBots.find((bot) => bot.id === selectedBotId) ?? sessions[0].bot
  const selectedMessages = messages[selectedBot.id] ?? []
  const isRunning = selectedMessages.some((message) => message.status === "streaming")

  function selectBot(id: string) {
    setSelectedBotId(id)
    setShowFunction(false)
  }

  function updateBot(id: string, update: (bot: PrototypeBot) => PrototypeBot) {
    setSessions((current) => current.map((session) => ({ bot: session.bot.id === id ? update(session.bot) : session.bot, members: session.members.map((member) => member.id === id ? update(member) : member) })))
  }

  function stop() {
    clearTimeout(timers.current[selectedBot.id])
    setMessages((current) => ({ ...current, [selectedBot.id]: (current[selectedBot.id] ?? []).map((message) => message.status === "streaming" ? { ...message, status: "interrupted" } : message) }))
    updateBot(selectedBot.id, (bot) => ({ ...bot, status: "idle" }))
  }

  function send() {
    const content = drafts[selectedBot.id]?.trim()

    if (!content || isRunning) return

    const personMessage: PrototypeMessage = { id: crypto.randomUUID(), author: "Você", role: "person", content, time: "Agora" }
    const responseId = crypto.randomUUID()
    const response: PrototypeMessage = { id: responseId, author: selectedBot.name, role: "bot", content: "", time: "Agora", status: "streaming", activity: ["Lendo o contexto do time", "Organizando a resposta"] }
    const words = fakeReply.split(" ")

    setDrafts((current) => ({ ...current, [selectedBot.id]: "" }))
    setMessages((current) => ({ ...current, [selectedBot.id]: [...(current[selectedBot.id] ?? []), personMessage, response] }))
    updateBot(selectedBot.id, (bot) => ({ ...bot, status: "working" }))

    function appendWord(index: number) {
      setMessages((current) => ({ ...current, [selectedBot.id]: (current[selectedBot.id] ?? []).map((message) => message.id === responseId ? { ...message, content: `${message.content}${index === 0 ? "" : " "}${words[index]}`, ...(index === words.length - 1 ? { status: undefined } : {}) } : message) }))
      if (index < words.length - 1) timers.current[selectedBot.id] = setTimeout(() => appendWord(index + 1), 70)
      else updateBot(selectedBot.id, (bot) => ({ ...bot, status: "idle" }))
    }

    timers.current[selectedBot.id] = setTimeout(() => appendWord(0), 280)
  }

  function createBot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const name = String(data.get("name") ?? "").trim()
    const outcome = String(data.get("outcome") ?? "").trim()

    if (!name || !outcome) return

    const id = crypto.randomUUID()
    const workingPath = String(data.get("workingPath") ?? "").trim()
    const bot: PrototypeBot = { id, name, outcome, role: "member", provider: data.get("provider") === "Codex" ? "Codex" : "Claude Code", status: "idle", ...(workingPath ? { workingPath } : {}) }
    setSessions((current) => [...current, { bot, members: [] }])
    setMessages((current) => ({ ...current, [id]: [] }))
    setSelectedBotId(id)
    setCreatorMode(undefined)
  }

  function createMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const name = String(data.get("name") ?? "").trim()
    const outcome = String(data.get("outcome") ?? "").trim()

    if (!name || !outcome) return

    const id = crypto.randomUUID()
    const workingPath = String(data.get("workingPath") ?? "").trim()
    const member: PrototypeBot = { id, name, outcome, role: "member", provider: data.get("provider") === "Codex" ? "Codex" : "Claude Code", status: "idle", temporary: data.get("temporary") === "on", ...(workingPath ? { workingPath } : {}) }
    setSessions((current) => current.map((session) => session.bot.id === selectedBot.id ? { bot: { ...session.bot, role: "leader" }, members: [...session.members, member] } : session))
    setMessages((current) => ({ ...current, [id]: [] }))
    setCreatorMode(undefined)
  }

  return (
    <main className="h-screen min-h-screen max-w-none overflow-hidden bg-canvas p-0 text-primary">
      <div className="grid h-screen min-h-screen grid-cols-[286px_minmax(0,1fr)] gap-3 bg-canvas py-3 pr-3 box-border max-[700px]:grid-cols-1 max-[700px]:grid-rows-[auto_minmax(0,1fr)] max-[700px]:gap-0 max-[700px]:p-0">
        <ConversationSidebar sessions={sessions} messages={messages} selectedBotId={selectedBot.id} onCreate={() => setCreatorMode("bot")} onSelect={selectBot} />
        <ChatPanel bot={selectedBot} draft={drafts[selectedBot.id] ?? ""} isRunning={isRunning} messages={selectedMessages} onDraftChange={(draft) => setDrafts((current) => ({ ...current, [selectedBot.id]: draft }))} onOpenBot={selectBot} onSend={send} onShowFunction={() => setShowFunction(true)} onStop={stop} />
      </div>
      {creatorMode === "bot" && <BotCreator onClose={() => setCreatorMode(undefined)} onSubmit={createBot} />}
      {creatorMode === "member" && <MemberCreator leader={selectedBot} onClose={() => setCreatorMode(undefined)} onSubmit={createMember} />}
      {showFunction && <FunctionPanel bot={selectedBot} canAddMember={sessions.some((session) => session.bot.id === selectedBot.id)} onAddMember={() => { setShowFunction(false); setCreatorMode("member") }} onClose={() => setShowFunction(false)} onWorkingPathChange={(workingPath) => updateBot(selectedBot.id, (bot) => ({ ...bot, workingPath: workingPath || undefined }))} />}
    </main>
  )
}

function ConversationSidebar({ sessions, messages, selectedBotId, onCreate, onSelect }: { sessions: PrototypeSession[]; messages: Record<string, PrototypeMessage[]>; selectedBotId: string; onCreate: () => void; onSelect: (id: string) => void }) {
  return (
    <aside className="grid min-w-0 grid-rows-[auto_1fr] bg-sidebar px-2.5 pt-3.5 pb-2.5 max-[700px]:flex max-[700px]:items-center max-[700px]:gap-1.5 max-[700px]:overflow-x-auto max-[700px]:border-b max-[700px]:border-outline max-[700px]:p-2.5 max-[700px]:[scrollbar-width:none] max-[700px]:[&::-webkit-scrollbar]:hidden">
      <div className="mx-1.5 mt-0 mb-2 ml-2.5 flex min-h-9 items-center justify-between max-[700px]:m-0 max-[700px]:min-h-0"><p className="m-0 text-metadata font-semibold tracking-[.08em] text-muted uppercase max-[700px]:hidden">Bots</p><button className="grid size-7 place-items-center rounded-lg bg-transparent p-0 text-muted hover:bg-surface-hover hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring max-[700px]:h-[54px] max-[700px]:w-11 max-[700px]:flex-none max-[700px]:border max-[700px]:border-outline [&_svg]:size-4" type="button" aria-label="Criar bot" onClick={onCreate}><PlusIcon aria-hidden="true" /></button></div>
      <nav className="min-h-0 overflow-y-auto max-[700px]:flex max-[700px]:items-center max-[700px]:gap-1.5 max-[700px]:overflow-visible" aria-label="Bots">
        {sessions.map((session) => <ConversationButton key={session.bot.id} bot={session.bot} members={session.members} messages={messages[session.bot.id] ?? []} selected={selectedBotId === session.bot.id} onSelect={onSelect} />)}
      </nav>
    </aside>
  )
}

function ConversationButton({ bot, members, messages, selected, onSelect }: { bot: PrototypeBot; members: PrototypeBot[]; messages: PrototypeMessage[]; selected: boolean; onSelect: (id: string) => void }) {
  const lastMessage = messages.at(-1)
  return <button className={`relative mb-[3px] flex w-full items-center gap-2.5 rounded-xl border p-2.5 text-left text-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring max-[700px]:min-h-16 max-[700px]:w-[172px] max-[700px]:flex-none ${selected ? "border-outline bg-surface-raised text-primary" : "border-transparent bg-transparent hover:border-outline hover:bg-surface-hover"}`} type="button" onClick={() => onSelect(bot.id)}><SessionAvatar bot={bot} members={members} /><span className="flex min-w-0 flex-1 flex-col gap-1"><span className="flex items-center justify-between gap-2"><strong className="text-control font-semibold text-primary">{bot.name}</strong><time className="text-metadata text-muted">{lastMessage?.time ?? "Novo"}</time></span><small className="overflow-hidden text-metadata text-ellipsis whitespace-nowrap text-muted">{members.length > 0 ? `${members.length + 1} bots · ` : ""}{statusLabels[bot.status]} · {lastMessage?.content ?? bot.outcome}</small></span></button>
}

function SessionAvatar({ bot, members }: { bot: PrototypeBot; members: PrototypeBot[] }) {
  const avatars = [bot, ...members].slice(0, 3)
  const statusDotClassName = `absolute right-[-2px] bottom-[-2px] size-2 rounded-full border-2 border-canvas ${statusDotClassNames[bot.status]}`

  if (avatars.length === 1) return <span className="relative flex flex-none"><BotAvatar bot={bot} /><span className={statusDotClassName} /></span>
  return <span className="relative h-[34px] w-[42px] flex-none [&_[data-avatar]]:absolute [&_[data-avatar]]:size-6 [&_[data-avatar]]:border-2 [&_[data-avatar]]:border-canvas [&_[data-avatar]:nth-child(1)]:top-0 [&_[data-avatar]:nth-child(1)]:left-[9px] [&_[data-avatar]:nth-child(1)]:z-[1] [&_[data-avatar]:nth-child(2)]:bottom-0 [&_[data-avatar]:nth-child(2)]:left-0 [&_[data-avatar]:nth-child(2)]:z-[2] [&_[data-avatar]:nth-child(3)]:right-0 [&_[data-avatar]:nth-child(3)]:bottom-0 [&_[data-avatar]:nth-child(3)]:z-[3]" aria-label={`${bot.name} lidera ${members.length} integrantes`}>{avatars.map((avatar) => <BotAvatar key={avatar.id} bot={avatar} />)}<span className={`${statusDotClassName} z-[4]`} /></span>
}

function ChatPanel({ bot, messages, draft, isRunning, onDraftChange, onOpenBot, onSend, onShowFunction, onStop }: { bot: PrototypeBot; messages: PrototypeMessage[]; draft: string; isRunning: boolean; onDraftChange: (value: string) => void; onOpenBot: (id: string) => void; onSend: () => void; onShowFunction: () => void; onStop: () => void }) {
  function handleComposerKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") { event.preventDefault(); onSend() }
  }

  return (
    <section className="relative grid min-h-0 min-w-0 grid-rows-[1fr_auto] overflow-hidden rounded-shell border border-outline bg-surface max-[700px]:rounded-none max-[700px]:border-x-0 max-[700px]:border-b-0">
      <button className="absolute top-6 right-[clamp(20px,4vw,48px)] z-[2] grid size-[30px] place-items-center rounded-lg bg-transparent p-0 text-muted hover:bg-surface-hover hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [&_svg]:size-[17px]" type="button" aria-label={`Abrir configurações de ${bot.name}`} onClick={onShowFunction}><Cog6ToothIcon aria-hidden="true" /></button>
      <div className="flex min-h-0 max-h-[calc(100vh-282px)] flex-col gap-8 overflow-y-auto px-[clamp(28px,12vw,180px)] py-8 max-[700px]:max-h-[470px] max-[700px]:px-[18px] max-[700px]:py-6" aria-live="polite">{messages.length === 0 ? <EmptyChat bot={bot} onDraftChange={onDraftChange} /> : messages.map((message) => <Message key={message.id} message={message} onOpenBot={onOpenBot} />)}</div>
      <div className="mx-[clamp(24px,9vw,136px)] mb-[22px] grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-full border border-outline-strong bg-surface-raised px-2 py-[7px] shadow-[0_14px_32px_rgb(0_0_0_/_24%)] focus-within:border-muted max-[700px]:mx-3 max-[700px]:mb-[18px]"><label className="sr-only" htmlFor={`prompt-${bot.id}`}>Mensagem para {bot.name}</label><button className="grid size-[34px] place-items-center rounded-full border border-outline-strong bg-transparent p-0 text-secondary hover:bg-surface-hover hover:text-primary active:bg-surface-active focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [&_svg]:size-4" type="button" aria-label="Adicionar contexto"><PlusIcon aria-hidden="true" /></button><input className="min-h-[38px] min-w-0 rounded-lg border-0 bg-transparent px-1 py-0 text-body text-primary placeholder:text-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" id={`prompt-${bot.id}`} placeholder={`Converse com ${bot.name}...`} value={draft} onChange={(event) => onDraftChange(event.target.value)} onKeyDown={handleComposerKey} />{isRunning ? <button className="inline-flex size-[34px] items-center justify-center rounded-full border border-outline-strong bg-transparent p-0 text-status-error hover:bg-surface-hover active:bg-surface-active focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [&_svg]:size-3.5" type="button" onClick={onStop} aria-label="Interromper resposta"><StopIcon aria-hidden="true" /></button> : <button className="grid size-[34px] place-items-center rounded-full bg-accent p-0 text-accent-ink hover:bg-primary active:scale-96 disabled:cursor-wait disabled:opacity-60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [&_svg]:size-[17px] [&_svg]:stroke-2" type="button" disabled={!draft.trim()} onClick={onSend} aria-label="Enviar mensagem"><ArrowUpIcon aria-hidden="true" /></button>}</div>
    </section>
  )
}

function EmptyChat({ bot, onDraftChange }: { bot: PrototypeBot; onDraftChange: (value: string) => void }) {
  return <div className="m-auto flex max-w-[520px] flex-col items-center text-center text-support text-secondary"><BotAvatar bot={bot} large /><h2 className="mt-4 mb-1.5 text-title font-semibold text-primary">Converse com {bot.name}</h2><p className="max-w-[48ch] leading-[1.6]">{bot.outcome}</p><div className="flex flex-wrap justify-center gap-2"><button className="rounded-lg border border-outline-strong bg-surface-raised px-3 py-2 text-control font-medium text-secondary hover:bg-surface-hover hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" type="button" onClick={() => onDraftChange("O que você recomenda fazer primeiro?")}>Pedir recomendação</button><button className="rounded-lg border border-outline-strong bg-surface-raised px-3 py-2 text-control font-medium text-secondary hover:bg-surface-hover hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" type="button" onClick={() => onDraftChange("Resuma o estado atual do seu trabalho.")}>Pedir resumo</button></div></div>
}

function BotAvatar({ bot, large = false }: { bot: PrototypeBot; large?: boolean }) {
  return <Blobatar data-avatar className={`grid flex-none place-items-center border border-outline-strong bg-surface-raised ${large ? "size-10 rounded-xl" : "size-8 rounded-[10px]"}`} name={`jolt:${bot.id}:${bot.name}`} size={large ? 40 : 32} alt="" />
}

function Message({ message, onOpenBot }: { message: PrototypeMessage; onOpenBot: (id: string) => void }) {
  const [decision, setDecision] = useState<string>()
  const [retried, setRetried] = useState(false)
  return (
    <article className={`max-w-[720px] ${message.role === "person" ? "max-w-[min(640px,84%)] self-end rounded-[16px_16px_4px_16px] bg-surface-active px-4 py-3" : ""}`}><div className="flex items-center justify-start gap-3 text-metadata font-medium text-muted"><strong className="font-semibold text-secondary">{message.author}</strong><span>{message.time}</span></div>{message.activity && <Thinking activity={message.activity} running={message.status === "streaming"} />}<p className="mt-2 mb-0 whitespace-pre-wrap text-body text-primary">{message.content}{message.status === "streaming" && <span className="ml-[3px] inline-block h-[15px] w-1.5 animate-pulse bg-accent align-text-bottom [animation-duration:900ms] motion-reduce:animate-none" aria-hidden="true" />}</p>
      {message.delegation && <div className="mt-3.5 flex items-center gap-3 rounded-xl border border-outline bg-surface-raised p-3 max-[700px]:flex-wrap max-[700px]:items-start"><span className={`grid size-[30px] flex-none place-items-center rounded-[9px] ${message.delegation.status === "done" ? "bg-[color-mix(in_oklch,var(--color-status-success)_18%,var(--color-surface))] text-status-success" : "bg-[color-mix(in_oklch,var(--color-status-working)_18%,var(--color-surface))] text-status-working"} [&_svg]:size-4`}>{message.delegation.status === "done" ? <CheckIcon aria-hidden="true" /> : <ArrowTopRightOnSquareIcon aria-hidden="true" />}</span><div className="min-w-0 flex-1"><strong className="text-support font-semibold text-primary">{message.delegation.bot}</strong><p className="mt-[3px] mb-0 text-metadata text-secondary">{message.delegation.task}</p></div><button className="flex-none rounded-lg border border-outline-strong bg-transparent px-3 py-2 text-metadata font-medium text-secondary hover:bg-surface-hover hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" type="button" onClick={() => onOpenBot(message.delegation?.botId ?? "leader")}>Abrir conversa</button></div>}
      {message.decision && <div className="mt-3.5 flex flex-col items-start gap-3 rounded-xl border border-[color-mix(in_oklch,var(--color-status-warning)_45%,transparent)] bg-[color-mix(in_oklch,var(--color-status-warning)_10%,var(--color-surface))] p-3"><strong className="text-support font-semibold text-primary">{decision ?? message.decision.question}</strong>{decision ? <small className="text-status-success">Resposta registrada</small> : <div className="flex flex-wrap gap-2">{message.decision.options.map((option) => <button className="rounded-lg border border-[color-mix(in_oklch,var(--color-status-warning)_45%,transparent)] bg-[color-mix(in_oklch,var(--color-status-warning)_18%,var(--color-surface))] px-3 py-2 text-metadata font-medium text-status-warning hover:bg-[color-mix(in_oklch,var(--color-status-warning)_25%,var(--color-surface))] active:bg-[color-mix(in_oklch,var(--color-status-warning)_32%,var(--color-surface))] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" key={option} type="button" onClick={() => setDecision(option)}>{option}</button>)}</div>}</div>}
      {message.error && <div className="mt-3.5 flex items-center gap-3 rounded-xl border border-[color-mix(in_srgb,var(--color-status-error)_45%,transparent)] bg-[color-mix(in_srgb,var(--color-status-error)_10%,var(--color-surface))] p-3 max-[700px]:flex-wrap max-[700px]:items-start"><div className="min-w-0 flex-1"><strong className="text-control font-semibold text-primary">{retried ? "Tentando novamente" : "O bot parou"}</strong><p className="mt-[3px] mb-0 text-support text-secondary">{retried ? "Reconectando ao Codex…" : message.error}</p></div><button className="flex-none rounded-lg border border-outline-strong bg-transparent px-3 py-2 text-metadata font-medium text-secondary hover:bg-surface-hover hover:text-primary disabled:cursor-wait disabled:opacity-60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" type="button" disabled={retried} onClick={() => setRetried(true)}>{retried ? "Tentando" : "Entrar novamente"}</button></div>}
      {message.status === "interrupted" && <span className="mt-2.5 inline-block text-metadata text-status-warning">Interrompido por você</span>}</article>
  )
}

function Thinking({ activity, running }: { activity: string[]; running: boolean }) {
  const label = running ? "Pensando" : activity.length === 1 ? "1 etapa concluída" : `${activity.length} etapas concluídas`
  return <details className="mt-2.5 text-support text-muted" open={running}><summary className="flex cursor-pointer items-center gap-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"><span className={`size-1.5 rounded-full ${running ? "animate-pulse bg-accent [animation-duration:900ms] motion-reduce:animate-none" : "bg-muted"}`} />{label}</summary><ul className="mt-2.5 mb-0 ml-1.5 border-l border-outline pl-[18px]">{activity.map((item) => <li className="list-item py-1" key={item}>{item}</li>)}</ul></details>
}

function BotCreator({ onClose, onSubmit }: { onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <div className="fixed inset-0 z-40 grid place-items-center bg-overlay p-6 backdrop-blur-lg" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><form className="w-[min(460px,100%)] rounded-[18px] border border-outline-strong bg-surface-raised p-6 shadow-[0_24px_80px_rgb(0_0_0_/_55%)]" onSubmit={onSubmit}><div className="mb-[22px] flex items-start justify-between gap-4"><div><p className="mb-0 text-metadata font-semibold tracking-[.08em] text-muted uppercase">Novo chat</p><h2 className="mb-0 text-title font-semibold text-primary">Criar bot</h2></div><button className="grid size-8 place-items-center rounded-lg bg-transparent p-0 text-secondary hover:bg-surface-hover hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [&_svg]:size-[18px]" type="button" onClick={onClose} aria-label="Fechar"><XMarkIcon aria-hidden="true" /></button></div><label className="mb-4 flex flex-col gap-2 text-control font-medium text-secondary">Nome<input className="w-full rounded-lg border border-outline-strong bg-canvas px-3 py-2.5 text-control text-primary placeholder:text-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" name="name" placeholder="Ex: Sofia" autoFocus required /></label><label className="mb-4 flex flex-col gap-2 text-control font-medium text-secondary">Função<input className="w-full rounded-lg border border-outline-strong bg-canvas px-3 py-2.5 text-control text-primary placeholder:text-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" name="outcome" placeholder="Ex: Revisar propostas antes do envio" required /></label><label className="mb-4 flex flex-col gap-2 text-control font-medium text-secondary">Executor<select className="w-full rounded-lg border border-outline-strong bg-canvas px-3 py-2.5 text-control text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" name="provider" defaultValue="Claude Code"><option>Claude Code</option><option>Codex</option></select></label><WorkingPathField /><div className="mt-[22px] flex justify-end gap-2"><button className="rounded-lg bg-transparent px-3 py-2 text-control font-medium text-secondary hover:bg-surface-hover hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" type="button" onClick={onClose}>Cancelar</button><button className="rounded-lg bg-accent px-3 py-2 text-control font-medium text-accent-ink hover:bg-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" type="submit">Criar bot</button></div></form></div>
}

function MemberCreator({ leader, onClose, onSubmit }: { leader: PrototypeBot; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <div className="fixed inset-0 z-40 grid place-items-center bg-overlay p-6 backdrop-blur-lg" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><form className="w-[min(460px,100%)] rounded-[18px] border border-outline-strong bg-surface-raised p-6 shadow-[0_24px_80px_rgb(0_0_0_/_55%)]" onSubmit={onSubmit}><div className="mb-[22px] flex items-start justify-between gap-4"><div><p className="mb-0 text-metadata font-semibold tracking-[.08em] text-muted uppercase">Time de {leader.name}</p><h2 className="mb-0 text-title font-semibold text-primary">Novo integrante</h2></div><button className="grid size-8 place-items-center rounded-lg bg-transparent p-0 text-secondary hover:bg-surface-hover hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [&_svg]:size-[18px]" type="button" onClick={onClose} aria-label="Fechar"><XMarkIcon aria-hidden="true" /></button></div><label className="mb-4 flex flex-col gap-2 text-control font-medium text-secondary">Nome<input className="w-full rounded-lg border border-outline-strong bg-canvas px-3 py-2.5 text-control text-primary placeholder:text-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" name="name" placeholder="Ex: Sofia" autoFocus required /></label><label className="mb-4 flex flex-col gap-2 text-control font-medium text-secondary">Função<input className="w-full rounded-lg border border-outline-strong bg-canvas px-3 py-2.5 text-control text-primary placeholder:text-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" name="outcome" placeholder="Ex: Analisar propostas antes do envio" required /></label><label className="mb-4 flex flex-col gap-2 text-control font-medium text-secondary">Executor<select className="w-full rounded-lg border border-outline-strong bg-canvas px-3 py-2.5 text-control text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" name="provider" defaultValue="Claude Code"><option>Claude Code</option><option>Codex</option></select></label><WorkingPathField defaultValue={leader.workingPath} inheritedFrom={leader.name} /><label className="mb-4 grid grid-cols-[auto_1fr] items-start gap-3 rounded-xl border border-outline p-3 text-control font-medium text-secondary"><input className="mt-[3px] w-auto accent-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" name="temporary" type="checkbox" /><span className="flex flex-col gap-1"><strong className="font-medium text-primary">Integrante temporário</strong><small className="text-support font-normal text-secondary">{leader.name} pode removê-lo quando o trabalho terminar.</small></span></label><div className="mt-[22px] flex justify-end gap-2"><button className="rounded-lg bg-transparent px-3 py-2 text-control font-medium text-secondary hover:bg-surface-hover hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" type="button" onClick={onClose}>Cancelar</button><button className="rounded-lg bg-accent px-3 py-2 text-control font-medium text-accent-ink hover:bg-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" type="submit">Criar integrante</button></div></form></div>
}

function WorkingPathField({ defaultValue, inheritedFrom }: { defaultValue?: string; inheritedFrom?: string }) {
  return <label className="mb-4 flex flex-col gap-2 text-control font-medium text-secondary"><span className="flex items-baseline justify-between">Pasta de trabalho <small className="text-support font-normal text-muted">Opcional</small></span><div className="flex gap-2"><input className="min-w-0 flex-1 rounded-lg border border-outline-strong bg-canvas px-3 py-2.5 text-control text-primary placeholder:text-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" name="workingPath" defaultValue={defaultValue} placeholder="Sem pasta" /><button className="rounded-lg border border-outline-strong bg-transparent px-3 text-control font-medium text-secondary hover:border-muted hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" type="button" onClick={(event) => { const input = event.currentTarget.previousElementSibling as HTMLInputElement; input.value = "/home/jui/projects/dogama/app" }}>Escolher</button></div>{inheritedFrom && defaultValue && <small className="text-support font-normal text-muted">Herdada de {inheritedFrom}. Você pode trocar ou remover.</small>}</label>
}

function FunctionPanel({ bot, canAddMember, onAddMember, onClose, onWorkingPathChange }: { bot: PrototypeBot; canAddMember: boolean; onAddMember: () => void; onClose: () => void; onWorkingPathChange: (workingPath: string) => void }) {
  return <div className="fixed inset-0 z-40 grid justify-items-end bg-overlay p-3 backdrop-blur-lg box-border" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><aside className="h-full w-[min(390px,100%)] box-border rounded-shell border border-outline-strong bg-surface-raised p-6 shadow-[0_24px_80px_rgb(0_0_0_/_55%)]"><div className="mb-[22px] flex items-start justify-between gap-4"><div><p className="mb-0 text-metadata font-semibold tracking-[.08em] text-muted uppercase">Função</p><h2 className="mb-0 text-title font-semibold text-primary">{bot.name}</h2></div><button className="grid size-8 place-items-center rounded-lg bg-transparent p-0 text-secondary hover:bg-surface-hover hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [&_svg]:size-[18px]" type="button" onClick={onClose} aria-label="Fechar"><XMarkIcon aria-hidden="true" /></button></div><div className="mb-3"><BotAvatar bot={bot} large /></div><span className="inline-block rounded-full border border-outline-strong px-[9px] py-[5px] text-metadata text-secondary">{bot.role === "leader" ? "Líder" : bot.temporary ? "Integrante temporário" : "Bot"}</span><dl className="mt-[26px]">{[["Resultado", bot.outcome], ["Executor", bot.provider]].map(([term, description]) => <div className="block border-b border-outline py-[15px]" key={term}><dt className="mb-1.5 text-metadata font-semibold tracking-[.08em] text-muted uppercase">{term}</dt><dd className="m-0 text-control text-primary">{description}</dd></div>)}<div className="block border-b border-outline py-[15px]"><dt className="mb-1.5 text-metadata font-semibold tracking-[.08em] text-muted uppercase">Pasta de trabalho</dt><dd className="m-0 text-control text-primary"><input className="w-full rounded-none border-0 border-b border-outline-strong bg-transparent px-0 pt-1 pb-1.5 text-control text-primary placeholder:text-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" aria-label="Pasta de trabalho" defaultValue={bot.workingPath} placeholder="Sem pasta" onBlur={(event) => onWorkingPathChange(event.currentTarget.value.trim())} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur() }} /></dd></div><div className="block border-b border-outline py-[15px]"><dt className="mb-1.5 text-metadata font-semibold tracking-[.08em] text-muted uppercase">Responsabilidade</dt><dd className="m-0 text-control text-primary">Usar o próprio histórico, executar o trabalho e informar decisões.</dd></div><div className="block border-b border-outline py-[15px]"><dt className="mb-1.5 text-metadata font-semibold tracking-[.08em] text-muted uppercase">Limite</dt><dd className="m-0 text-control text-primary">Não altera preço nem envia conteúdo sem aprovação.</dd></div></dl>{canAddMember && <button className="mt-6 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-outline-strong bg-transparent px-3 py-2 text-control font-medium text-secondary hover:bg-surface-hover hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [&_svg]:size-4" type="button" onClick={onAddMember}><PlusIcon aria-hidden="true" />Adicionar integrante</button>}</aside></div>
}
