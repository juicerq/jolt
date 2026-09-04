import { CheckIcon, PencilIcon, PlusIcon, TrashIcon, XMarkIcon } from "@heroicons/react/24/outline"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { type FormEvent, type KeyboardEvent, useState } from "react"
import type { Bot } from "@src/shared/bots"
import type { Memory } from "@src/shared/memory"
import { memoryLimits, memoryUsage } from "@src/shared/memory-limits"
import type { EngineClient } from "../engine-client"
import { Button } from "../ui/button"
import { fieldControlClassName } from "../ui/field"
import { IconButton } from "../ui/icon-button"
import { SettingsSection } from "../ui/settings-section"
import { Switch } from "../ui/switch"
import { useEscape } from "../ui/use-escape"
import { revealClassName } from "./bot-form"
import { BotPage, BotPageIdentity } from "./bot-page"

const learnedFrom = { person: "Aprendeu com você", routine: "Aprendeu em uma Rotina", bot: "Aprendeu com outro Bot" }

export function describeOrigin(memory: Pick<Memory, "origin" | "turnAuthor" | "createdAt">) {
  const date = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(memory.createdAt))
  const source = memory.origin === "person" ? "Você adicionou" : learnedFrom[memory.turnAuthor ?? "bot"]

  return `${source} · ${date}`
}

export function MemoryList({ memories, busy, onEdit, onForget }: { memories: Memory[]; busy: boolean; onEdit?: (id: string, content: string) => void; onForget?: (id: string) => void }) {
  if (memories.length === 0) {
    return <p className="m-0 text-support text-muted">Nenhuma Lembrança ainda.</p>
  }

  return (
    <ul className="m-0 flex list-none flex-col divide-y divide-outline p-0">
      {memories.map((memory) => <MemoryRow key={memory.id} memory={memory} busy={busy} {...(onEdit ? { onEdit } : {})} {...(onForget ? { onForget } : {})} />)}
    </ul>
  )
}

function MemoryRow({ memory, busy, onEdit, onForget }: { memory: Memory; busy: boolean; onEdit?: (id: string, content: string) => void; onForget?: (id: string) => void }) {
  const [draft, setDraft] = useState<string>()
  const editing = draft !== undefined
  const content = draft?.trim() ?? ""

  function cancel() {
    setDraft(undefined)
  }

  function save() {
    if (!onEdit || !content || content === memory.content) {
      cancel()
      return
    }

    onEdit(memory.id, content)
    cancel()
  }

  function handleKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault()
      save()
    }

    if (event.key === "Escape") {
      event.preventDefault()
      event.stopPropagation()
      cancel()
    }
  }

  return (
    <li className="flex items-center gap-2 py-2.5 first:pt-0">
      <div className="min-w-0 flex-1">
        {editing
          ? <input className={fieldControlClassName} autoComplete="off" maxLength={memoryLimits.memory} aria-label="Lembrança" autoFocus value={draft} disabled={busy} onChange={(event) => setDraft(event.target.value)} onKeyDown={handleKey} />
          : <p className="m-0 text-control font-medium text-primary">{memory.content}</p>}
        <p className="m-0 text-support text-muted">{describeOrigin(memory)}</p>
      </div>
      {editing && onEdit && (
        <>
          <IconButton iconSize={14} size={28} type="button" disabled={busy || !content} label="Salvar Lembrança" onClick={save}><CheckIcon aria-hidden="true" /></IconButton>
          <IconButton iconSize={14} size={28} type="button" disabled={busy} label="Cancelar edição" onClick={cancel}><XMarkIcon aria-hidden="true" /></IconButton>
        </>
      )}
      {!editing && onEdit && <IconButton iconSize={14} size={28} type="button" disabled={busy} label="Editar Lembrança" onClick={() => setDraft(memory.content)}><PencilIcon aria-hidden="true" /></IconButton>}
      {!editing && onForget && <IconButton iconSize={14} size={28} type="button" disabled={busy} label="Esquecer Lembrança" onClick={() => onForget(memory.id)}><TrashIcon aria-hidden="true" /></IconButton>}
    </li>
  )
}

function clearNote(bot: Bot, count: number) {
  const memories = count === 1 ? "1 Lembrança" : `${count} Lembranças`

  return `Limpar a Memória de ${bot.name} apaga ${memories} e as Notas que ainda não viraram Lembrança. Não é possível desfazer.`
}

function TeamMemory({ leader, client }: { leader: Pick<Bot, "id" | "name">; client: EngineClient }) {
  const { data: memories, error } = useQuery(client.query.memory.list.queryOptions({ input: { botId: leader.id } }))

  if (error) {
    return <p className="m-0 text-support text-status-error">Falha na Memória do Time: {error.message}</p>
  }

  if (!memories || memories.length === 0) {
    return null
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 text-control font-semibold text-secondary">O que {leader.name} sabe</p>
      <MemoryList memories={memories} busy={false} />
    </div>
  )
}

export function BotMemory({ bot, client, leader, onClose }: { bot: Bot; client: EngineClient; leader?: Pick<Bot, "id" | "name">; onClose: () => void }) {
  useEscape(onClose)

  return (
    <BotPage label={`Memórias de ${bot.name}`}>
      <BotPageIdentity bot={bot} />
      {bot.temporary
        ? <TemporaryMemory client={client} {...(leader ? { leader } : {})} />
        : <OwnMemory bot={bot} client={client} {...(leader ? { leader } : {})} />}
    </BotPage>
  )
}

function TemporaryMemory({ client, leader }: { client: EngineClient; leader?: Pick<Bot, "id" | "name"> }) {
  return (
    <SettingsSection title="Memória">
      <p className="m-0 text-support text-muted">Um Integrante temporário não tem Memória própria.{leader && ` Ele lê o que ${leader.name} sabe.`}</p>
      {leader && <TeamMemory leader={leader} client={client} />}
    </SettingsSection>
  )
}

function OwnMemory({ bot, client, leader }: { bot: Bot; client: EngineClient; leader?: Pick<Bot, "id" | "name"> }) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState("")
  const [confirmingClear, setConfirmingClear] = useState(false)
  const listOptions = client.query.memory.list.queryOptions({ input: { botId: bot.id } })
  const { data: memories, error: listError } = useQuery(listOptions)
  const refresh = () => queryClient.invalidateQueries({ queryKey: listOptions.queryKey })
  const { mutate: add, isPending: adding, error: addError } = useMutation(client.query.memory.add.mutationOptions({ onSuccess() {
    refresh()
    setDraft("")
  } }))
  const { mutate: updateMemory, isPending: updating, error: updateError } = useMutation(client.query.memory.update.mutationOptions({ onSuccess: refresh }))
  const { mutate: forget, isPending: forgetting, error: forgetError } = useMutation(client.query.memory.forget.mutationOptions({ onSuccess: refresh }))
  const { mutate: clear, isPending: clearing, error: clearError } = useMutation(client.query.memory.clear.mutationOptions({ onSuccess() {
    refresh()
    setConfirmingClear(false)
  } }))
  const { mutate: updateBot, isPending: toggling, error: toggleError } = useMutation(client.query.bots.update.mutationOptions({ onSuccess() {
    queryClient.invalidateQueries({ queryKey: client.query.projects.list.queryOptions().queryKey })
  } }))
  const content = draft.trim()
  const busy = adding || updating || forgetting || clearing || toggling
  const failure = listError?.message ?? addError?.message ?? updateError?.message ?? forgetError?.message ?? clearError?.message ?? toggleError?.message
  const state = bot.memoryEnabled ? `${bot.name} lê as Lembranças e anota o que aprende.` : `${bot.name} não lê nem anota, nem o que o Líder sabe. Nada foi apagado.`

  function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!content) {
      return
    }

    add({ botId: bot.id, content })
  }

  const toggle = <Switch checked={bot.memoryEnabled} disabled={busy} aria-label="Memória ligada" onChange={(memoryEnabled) => updateBot({ id: bot.id, name: bot.name, function: bot.function, projectId: bot.projectId, workingDirectoryOverride: bot.workingDirectoryOverride, memoryEnabled, effort: bot.effort, model: bot.model, permissionMode: bot.permissionMode })} />

  if (!bot.memoryEnabled) {
    return (
      <SettingsSection title="Memória" action={toggle}>
        <p className="m-0 text-support text-muted">{state}</p>
        {failure && <p className="m-0 text-support text-status-error">Falha na Memória: {failure}</p>}
      </SettingsSection>
    )
  }

  return (
    <SettingsSection title="Memória" action={toggle}>
      <p className="m-0 text-support text-muted">{state}</p>
      {memories && <MemoryList memories={memories} busy={busy} onEdit={(id, content) => updateMemory({ id, content })} onForget={(id) => forget({ id })} />}
      {memories && memories.length > 0 && <p className="m-0 text-metadata font-medium text-muted">{memoryUsage(memories)} de {memoryLimits.total} caracteres</p>}
      <form className="flex items-start gap-2" onSubmit={handleAdd}>
        <label className="min-w-0 flex-1">
          <span className="sr-only">Nova Lembrança</span>
          <input className={fieldControlClassName} autoComplete="off" maxLength={memoryLimits.memory} placeholder="Entrego relatórios em PDF, nunca em planilha" value={draft} disabled={busy || confirmingClear} onChange={(event) => setDraft(event.target.value)} />
        </label>
        <Button className="inline-flex items-center gap-2" variant="secondary" type="submit" disabled={busy || confirmingClear || !content}><PlusIcon className="size-4" aria-hidden="true" />{adding ? "Adicionando..." : "Adicionar"}</Button>
      </form>
      {memories && memories.length > 0 && !confirmingClear && <Button className="self-start" variant="text" type="button" disabled={busy} onClick={() => setConfirmingClear(true)}>Limpar a Memória</Button>}
      {memories && confirmingClear && (
        <div className={`${revealClassName} flex flex-col items-start gap-4`}>
          <p className="m-0 text-control font-medium text-secondary">{clearNote(bot, memories.length)}</p>
          <div className="flex gap-2">
            <Button variant="text" type="button" autoFocus disabled={clearing} onClick={() => setConfirmingClear(false)}>Cancelar</Button>
            <Button variant="danger" type="button" disabled={clearing} onClick={() => clear({ botId: bot.id })}>{clearing ? "Limpando..." : "Limpar a Memória"}</Button>
          </div>
        </div>
      )}
      {failure && <p className="m-0 text-support text-status-error">Falha na Memória: {failure}</p>}
      {leader && <TeamMemory leader={leader} client={client} />}
    </SettingsSection>
  )
}
