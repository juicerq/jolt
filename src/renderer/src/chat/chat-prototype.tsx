import { Blobatar } from "@blobatar/react"
import { type FormEvent, type KeyboardEvent, useRef, useState } from "react"
import { fakeReply, initialMessages, prototypeSessions, statusLabels, type PrototypeBot, type PrototypeMessage, type PrototypeSession } from "./chat-prototype-data"

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
    <main className="chat-prototype grok-prototype">
      <div className="chat-layout grok-layout">
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
    <aside className="conversation-sidebar">
      <div className="conversation-sidebar-heading"><p>Bots</p><button type="button" aria-label="Criar bot" onClick={onCreate}>+</button></div>
      <nav className="conversation-list" aria-label="Bots">
        {sessions.map((session) => <ConversationButton key={session.bot.id} bot={session.bot} members={session.members} messages={messages[session.bot.id] ?? []} selected={selectedBotId === session.bot.id} onSelect={onSelect} />)}
      </nav>
    </aside>
  )
}

function ConversationButton({ bot, members, messages, selected, onSelect }: { bot: PrototypeBot; members: PrototypeBot[]; messages: PrototypeMessage[]; selected: boolean; onSelect: (id: string) => void }) {
  const lastMessage = messages.at(-1)
  return <button className={selected ? "conversation-button selected" : "conversation-button"} type="button" onClick={() => onSelect(bot.id)}><SessionAvatar bot={bot} members={members} /><span className="conversation-copy"><span><strong>{bot.name}</strong><time>{lastMessage?.time ?? "Novo"}</time></span><small>{members.length > 0 ? `${members.length + 1} bots · ` : ""}{statusLabels[bot.status]} · {lastMessage?.content ?? bot.outcome}</small></span></button>
}

function SessionAvatar({ bot, members }: { bot: PrototypeBot; members: PrototypeBot[] }) {
  const avatars = [bot, ...members].slice(0, 3)
  if (avatars.length === 1) return <span className="avatar-wrap"><BotAvatar bot={bot} /><span className={`status-dot ${bot.status}`} /></span>
  return <span className="team-avatar-stack" aria-label={`${bot.name} lidera ${members.length} integrantes`}>{avatars.map((avatar) => <BotAvatar key={avatar.id} bot={avatar} />)}<span className={`status-dot ${bot.status}`} /></span>
}

function ChatPanel({ bot, messages, draft, isRunning, onDraftChange, onOpenBot, onSend, onShowFunction, onStop }: { bot: PrototypeBot; messages: PrototypeMessage[]; draft: string; isRunning: boolean; onDraftChange: (value: string) => void; onOpenBot: (id: string) => void; onSend: () => void; onShowFunction: () => void; onStop: () => void }) {
  function handleComposerKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") { event.preventDefault(); onSend() }
  }

  return (
    <section className="chat-panel">
      <button className="chat-settings-button" type="button" aria-label={`Abrir configurações de ${bot.name}`} onClick={onShowFunction}>⚙</button>
      <div className="message-list" aria-live="polite">{messages.length === 0 ? <EmptyChat bot={bot} onDraftChange={onDraftChange} /> : messages.map((message) => <Message key={message.id} message={message} onOpenBot={onOpenBot} />)}</div>
      <div className="prompt-bar"><label htmlFor={`prompt-${bot.id}`}>Mensagem para {bot.name}</label><button className="prompt-add-button" type="button" aria-label="Adicionar contexto">+</button><input id={`prompt-${bot.id}`} placeholder={`Converse com ${bot.name}...`} value={draft} onChange={(event) => onDraftChange(event.target.value)} onKeyDown={handleComposerKey} />{isRunning ? <button className="stop-button" type="button" onClick={onStop}>■ Interromper</button> : <button className="prompt-send-button" type="button" disabled={!draft.trim()} onClick={onSend} aria-label="Enviar mensagem">↑</button>}</div>
    </section>
  )
}

function EmptyChat({ bot, onDraftChange }: { bot: PrototypeBot; onDraftChange: (value: string) => void }) {
  return <div className="chat-empty"><BotAvatar bot={bot} large /><h2>Converse com {bot.name}</h2><p>{bot.outcome}</p><div><button type="button" onClick={() => onDraftChange("O que você recomenda fazer primeiro?")}>Pedir recomendação</button><button type="button" onClick={() => onDraftChange("Resuma o estado atual do seu trabalho.")}>Pedir resumo</button></div></div>
}

function BotAvatar({ bot, large = false }: { bot: PrototypeBot; large?: boolean }) {
  return <Blobatar className={large ? "bot-avatar large" : "bot-avatar"} name={`jots:${bot.id}:${bot.name}`} size={large ? 40 : 32} alt="" />
}

function Message({ message, onOpenBot }: { message: PrototypeMessage; onOpenBot: (id: string) => void }) {
  const [decision, setDecision] = useState<string>()
  const [retried, setRetried] = useState(false)
  return (
    <article className={`chat-message ${message.role}`}><div className="message-meta"><strong>{message.author}</strong><span>{message.time}</span></div>{message.activity && <Thinking activity={message.activity} running={message.status === "streaming"} />}<p>{message.content}{message.status === "streaming" && <span className="stream-cursor" aria-hidden="true" />}</p>
      {message.delegation && <div className={`delegation-card ${message.delegation.status}`}><span>{message.delegation.status === "done" ? "✓" : "↗"}</span><div><strong>{message.delegation.bot}</strong><p>{message.delegation.task}</p></div><button type="button" onClick={() => onOpenBot(message.delegation?.botId ?? "leader")}>Abrir conversa</button></div>}
      {message.decision && <div className="decision-card"><strong>{decision ?? message.decision.question}</strong>{decision ? <small>Resposta registrada</small> : <div>{message.decision.options.map((option) => <button key={option} type="button" onClick={() => setDecision(option)}>{option}</button>)}</div>}</div>}
      {message.error && <div className="message-error"><div><strong>{retried ? "Tentando novamente" : "O bot parou"}</strong><p>{retried ? "Reconectando ao Codex…" : message.error}</p></div><button type="button" disabled={retried} onClick={() => setRetried(true)}>{retried ? "Tentando" : "Entrar novamente"}</button></div>}
      {message.status === "interrupted" && <span className="interrupted-label">Interrompido por você</span>}</article>
  )
}

function Thinking({ activity, running }: { activity: string[]; running: boolean }) {
  const label = running ? "Pensando" : activity.length === 1 ? "1 etapa concluída" : `${activity.length} etapas concluídas`
  return <details className="thinking" open={running}><summary><span className={running ? "thinking-dot running" : "thinking-dot"} />{label}</summary><ul>{activity.map((item) => <li key={item}>{item}</li>)}</ul></details>
}

function BotCreator({ onClose, onSubmit }: { onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <div className="prototype-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><form className="member-creator" onSubmit={onSubmit}><div className="modal-heading"><div><p className="eyebrow">Novo chat</p><h2>Criar bot</h2></div><button type="button" onClick={onClose} aria-label="Fechar">×</button></div><label>Nome<input name="name" placeholder="Ex: Sofia" autoFocus required /></label><label>Função<input name="outcome" placeholder="Ex: Revisar propostas antes do envio" required /></label><label>Executor<select name="provider" defaultValue="Claude Code"><option>Claude Code</option><option>Codex</option></select></label><WorkingPathField /><div className="modal-actions"><button type="button" onClick={onClose}>Cancelar</button><button type="submit">Criar bot</button></div></form></div>
}

function MemberCreator({ leader, onClose, onSubmit }: { leader: PrototypeBot; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <div className="prototype-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><form className="member-creator" onSubmit={onSubmit}><div className="modal-heading"><div><p className="eyebrow">Time de {leader.name}</p><h2>Novo integrante</h2></div><button type="button" onClick={onClose} aria-label="Fechar">×</button></div><label>Nome<input name="name" placeholder="Ex: Sofia" autoFocus required /></label><label>Função<input name="outcome" placeholder="Ex: Analisar propostas antes do envio" required /></label><label>Executor<select name="provider" defaultValue="Claude Code"><option>Claude Code</option><option>Codex</option></select></label><WorkingPathField defaultValue={leader.workingPath} inheritedFrom={leader.name} /><label className="temporary-toggle"><input name="temporary" type="checkbox" /><span><strong>Integrante temporário</strong><small>{leader.name} pode removê-lo quando o trabalho terminar.</small></span></label><div className="modal-actions"><button type="button" onClick={onClose}>Cancelar</button><button type="submit">Criar integrante</button></div></form></div>
}

function WorkingPathField({ defaultValue, inheritedFrom }: { defaultValue?: string; inheritedFrom?: string }) {
  return <label className="working-path-field"><span>Pasta de trabalho <small>Opcional</small></span><div><input name="workingPath" defaultValue={defaultValue} placeholder="Sem pasta" /><button type="button" onClick={(event) => { const input = event.currentTarget.previousElementSibling as HTMLInputElement; input.value = "/home/jui/projects/dogama/app" }}>Escolher</button></div>{inheritedFrom && defaultValue && <small>Herdada de {inheritedFrom}. Você pode trocar ou remover.</small>}</label>
}

function FunctionPanel({ bot, canAddMember, onAddMember, onClose, onWorkingPathChange }: { bot: PrototypeBot; canAddMember: boolean; onAddMember: () => void; onClose: () => void; onWorkingPathChange: (workingPath: string) => void }) {
  return <div className="prototype-overlay panel-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><aside className="function-drawer"><div className="modal-heading"><div><p className="eyebrow">Função</p><h2>{bot.name}</h2></div><button type="button" onClick={onClose} aria-label="Fechar">×</button></div><BotAvatar bot={bot} large /><span className="role-chip">{bot.role === "leader" ? "Líder" : bot.temporary ? "Integrante temporário" : "Bot"}</span><dl><div><dt>Resultado</dt><dd>{bot.outcome}</dd></div><div><dt>Executor</dt><dd>{bot.provider}</dd></div><div><dt>Pasta de trabalho</dt><dd><input className="working-path-setting" aria-label="Pasta de trabalho" defaultValue={bot.workingPath} placeholder="Sem pasta" onBlur={(event) => onWorkingPathChange(event.currentTarget.value.trim())} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur() }} /></dd></div><div><dt>Responsabilidade</dt><dd>Usar o próprio histórico, executar o trabalho e informar decisões.</dd></div><div><dt>Limite</dt><dd>Não altera preço nem envia conteúdo sem aprovação.</dd></div></dl>{canAddMember && <button className="add-member-button" type="button" onClick={onAddMember}>+ Adicionar integrante</button>}</aside></div>
}
