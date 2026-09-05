import { ChevronDownIcon, Cog6ToothIcon, UserPlusIcon } from "@heroicons/react/24/outline"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { type FormEvent, useRef, useState } from "react"
import type { Bot } from "@src/shared/bots"
import type { ProjectGroups } from "@src/shared/projects"
import type { EngineClient } from "../engine-client"
import { Button } from "../ui/button"
import { Field, fieldControlClassName } from "../ui/field"
import { IconButton } from "../ui/icon-button"
import { SettingsSection, settingsPanelClassName } from "../ui/settings-section"
import { useEscape } from "../ui/use-escape"
import { BotFace } from "./bot-face"
import { BotMemberPicker } from "./bot-member-picker"
import { BotPage, BotPageIdentity } from "./bot-page"
import { openBotRoute, selectBot } from "./bots-store"
import { groupMembers } from "./member-groups"
import { teamLeaders } from "./team"

export function BotMembers({ bot, client, groups, onClose }: { bot: Bot; client: EngineClient; groups: ProjectGroups | undefined; onClose: () => void }) {
  const [adding, setAdding] = useState<"create" | "existing" | null>(null)
  const [createdName, setCreatedName] = useState("")
  const addButton = useRef<HTMLButtonElement>(null)
  const existingButton = useRef<HTMLButtonElement>(null)
  const members = teamLeaders(groups).find((candidate) => candidate.id === bot.id)?.members ?? []
  const { permanent, active, closed } = groupMembers(members)

  function closeForm() {
    const button = adding === "existing" ? existingButton : addButton
    setAdding(null)
    requestAnimationFrame(() => button.current?.focus())
  }

  useEscape(() => { if (!adding) { onClose() } })

  function memberAdded(member: Bot) {
    setCreatedName(member.name)
    closeForm()
  }

  return (
    <BotPage label={`Integrantes de ${bot.name}`}>
      <BotPageIdentity bot={bot} />
      <SettingsSection title="Integrantes">
        {permanent.length === 0 && active.length === 0 && !adding && <p className="m-0 text-support text-secondary">Adicione o primeiro Integrante para {bot.name} liderar um time e distribuir tarefas.</p>}
        {!adding && <div className="flex flex-wrap items-center gap-2">
          <Button ref={addButton} className="inline-flex items-center gap-2" variant="secondary" type="button" onClick={() => { setCreatedName(""); setAdding("create") }}><UserPlusIcon className="size-4" aria-hidden="true" />Criar integrante</Button>
          <Button ref={existingButton} variant="text" type="button" onClick={() => { setCreatedName(""); setAdding("existing") }}>Adicionar Bot existente</Button>
        </div>}
        {adding === "create" && <MemberCreateForm bot={bot} client={client} onCancel={closeForm} onCreated={memberAdded} />}
        {adding === "existing" && <BotMemberPicker bot={bot} client={client} groups={groups} onCancel={closeForm} onAdded={memberAdded} />}
        {createdName && <p className="m-0 text-support text-secondary" role="status">{createdName} adicionado ao time de {bot.name}.</p>}
        {permanent.length > 0 && <MemberList members={permanent} />}
      </SettingsSection>
      {active.length > 0 && <SettingsSection title="Temporários"><MemberList members={active} /></SettingsSection>}
      {closed.length > 0 && (
        <details className="group">
          <summary className="-mx-2 flex cursor-pointer list-none items-center gap-2 rounded-lg px-2 py-2 text-support text-secondary hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
            <ChevronDownIcon className="size-3.5 -rotate-90 transition-transform duration-150 group-open:rotate-0 motion-reduce:transition-none" aria-hidden="true" />Encerrados · {closed.length}
          </summary>
          <div className="mt-4"><MemberList members={closed} /></div>
        </details>
      )}
    </BotPage>
  )
}

function MemberList({ members }: { members: Bot[] }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-1 p-0">
      {members.map((member) => (
        <li className="flex min-w-0 items-center gap-2" key={member.id}>
          <button className="-ml-2 flex min-w-0 flex-1 items-center gap-3 rounded-lg p-2 text-left hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring active:bg-surface-active" type="button" aria-label={`Abrir conversa de ${member.name}`} onClick={() => selectBot(member.id)}>
            <BotFace className="size-[38px] flex-none" name={member.avatarSeed} botId={member.id} size={38} />
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <strong className="text-control font-semibold break-words text-primary">{member.name}</strong>
              <span className="text-support break-words text-secondary">{member.function.outcome}</span>
            </span>
          </button>
          {!member.closed && <IconButton iconSize={16} type="button" label={`Configurações de ${member.name}`} onClick={() => { selectBot(member.id); openBotRoute({ name: "settings" }) }}><Cog6ToothIcon aria-hidden="true" /></IconButton>}
        </li>
      ))}
    </ul>
  )
}

function MemberCreateForm({ bot, client, onCancel, onCreated }: { bot: Pick<Bot, "id" | "name">; client: EngineClient; onCancel: () => void; onCreated: (member: Bot) => void }) {
  const [name, setName] = useState("")
  const [outcome, setOutcome] = useState("")
  const queryClient = useQueryClient()
  const { data: providers, error: providersError, isPending: providersPending } = useQuery(client.query.providers.list.queryOptions())
  const executorAvailable = providers?.some((provider) => provider.status === "available") ?? false
  const { mutate: create, isPending: creating, error } = useMutation(client.query.bots.create.mutationOptions({
    async onSuccess(member) {
      await queryClient.invalidateQueries({ queryKey: client.query.projects.list.queryOptions().queryKey })
      onCreated(member)
    },
  }))
  useEscape(() => { if (!creating) { onCancel() } })

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedName = name.trim()
    const trimmedOutcome = outcome.trim()

    if (!trimmedName || creating || !executorAvailable) {
      return
    }

    create({ name: trimmedName, leaderBotId: bot.id, ...(trimmedOutcome ? { function: { outcome: trimmedOutcome } } : {}) })
  }

  return (
    <form className={`${settingsPanelClassName} flex flex-col gap-4`} aria-label={`Adicionar integrante de ${bot.name}`} onSubmit={handleSubmit}>
      <div>
        <h3 className="m-0 text-section font-semibold text-primary">Novo integrante</h3>
        <p className="m-0 mt-1 text-support text-secondary">Um Bot permanente no time de {bot.name}.</p>
      </div>
      <Field label="Nome"><input className={fieldControlClassName} autoFocus autoComplete="off" placeholder="Pesquisador" required value={name} disabled={creating} onChange={(event) => setName(event.target.value)} /></Field>
      <Field label="O que ele entrega?" optional><input className={fieldControlClassName} autoComplete="off" placeholder="Pesquisar fontes e reunir evidências" value={outcome} disabled={creating} onChange={(event) => setOutcome(event.target.value)} /></Field>
      {providersPending && <p className="m-0 text-support text-secondary" role="status">Verificando Fornecedores...</p>}
      {providersError && <p className="m-0 text-support text-status-error" role="alert">Falha ao verificar Fornecedores: {providersError.message}</p>}
      {!providersPending && !providersError && !executorAvailable && <p className="m-0 text-support text-status-warning">Conecte um Fornecedor nas Configurações para adicionar um Integrante.</p>}
      {error && <p className="m-0 text-support text-status-error" role="alert">Falha ao adicionar integrante: {error.message}</p>}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="text" type="button" disabled={creating} onClick={onCancel}>Cancelar</Button>
        <Button type="submit" disabled={!name.trim() || creating || !executorAvailable}>{creating ? "Adicionando..." : "Adicionar integrante"}</Button>
      </div>
    </form>
  )
}
