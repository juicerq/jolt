import { ArrowLeftIcon } from "@heroicons/react/24/outline"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { type FormEvent, useState } from "react"
import type { Bot } from "@src/shared/bots"
import type { Trigger } from "@src/shared/triggers"
import type { EngineClient } from "../engine-client"
import { Button } from "../ui/button"
import { Field, fieldControlClassName } from "../ui/field"
import { Select } from "../ui/select"
import { SettingsSection } from "../ui/settings-section"
import { Switch } from "../ui/switch"
import { ToggleChip } from "../ui/toggle-chip"
import { useEscape } from "../ui/use-escape"
import { BotPage, BotPageIdentity, BotPageSaveBar } from "./bot-page"
import { triggerActionLabels, triggerEvents } from "./trigger-options"

export function BotTriggerEditor({ bot, client, triggerId, onClose }: { bot: Bot; client: EngineClient; triggerId: string; onClose: () => void }) {
  const { data: triggers, error, isPending } = useQuery(client.query.triggers.list.queryOptions({ input: { botId: bot.id } }))
  const trigger = triggers?.find((candidate) => candidate.id === triggerId)

  if (trigger) {
    return <BotTriggerForm bot={bot} client={client} trigger={trigger} onClose={onClose} />
  }

  return (
    <BotPage label={`Editar Gatilho de ${bot.name}`}>
      <BotPageIdentity bot={bot} />
      <p className={`m-0 text-support ${isPending ? "text-muted" : "text-status-error"}`}>{isPending ? "Carregando Gatilho..." : error?.message ?? "Este Gatilho não existe mais."}</p>
      <Button variant="text" type="button" className="self-start" onClick={onClose}>Voltar aos Gatilhos</Button>
    </BotPage>
  )
}

function draftOf(trigger: Trigger) {
  return { name: trigger.name, instruction: trigger.instruction, event: trigger.event, actions: trigger.actions, labels: trigger.labels.join(", "), includeOwnEvents: trigger.includeOwnEvents }
}

function BotTriggerForm({ bot, client, trigger, onClose }: { bot: Bot; client: EngineClient; trigger: Trigger; onClose: () => void }) {
  const [initial] = useState(() => draftOf(trigger))
  const [draft, setDraft] = useState(initial)
  const queryClient = useQueryClient()
  const { mutate: update, isPending: saving, error, reset } = useMutation(client.query.triggers.update.mutationOptions({ async onSuccess() {
    await queryClient.invalidateQueries({ queryKey: client.query.triggers.list.queryOptions({ input: { botId: bot.id } }).queryKey })
    onClose()
  } }))
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial)
  const complete = !!draft.name.trim() && !!draft.instruction.trim() && draft.actions.length > 0
  const eventOptions = triggerEvents.find((option) => option.value === draft.event)
  const actions = [...new Set([...(eventOptions?.actions ?? []), ...draft.actions])]
  const primaryActions = actions.slice(0, 6)
  const moreActions = actions.slice(6)
  useEscape(() => !saving && onClose())

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!complete || !dirty || saving) {
      return
    }

    update({ ...draft, id: trigger.id, name: draft.name.trim(), instruction: draft.instruction.trim(), labels: [...new Set(draft.labels.split(",").map((label) => label.trim()).filter(Boolean))], repositories: trigger.repositories, status: trigger.status })
  }

  function toggleAction(action: string) {
    setDraft({ ...draft, actions: draft.actions.includes(action) ? draft.actions.filter((value) => value !== action) : [...draft.actions, action] })
  }

  function handleDiscard() {
    setDraft(initial)
    reset()
  }

  const footer = dirty ? <BotPageSaveBar form="trigger-editor" complete={complete} saving={saving} {...(error ? { failure: `Falha ao salvar: ${error.message}` } : {})} onDiscard={handleDiscard} /> : undefined

  return (
    <BotPage label={`Editar Gatilho de ${bot.name}`} footer={footer}>
      <Button variant="text" type="button" className="inline-flex items-center gap-2 self-start" disabled={saving} onClick={onClose}><ArrowLeftIcon className="size-4" aria-hidden="true" />Gatilhos</Button>
      <BotPageIdentity bot={bot} />
      <form id="trigger-editor" className="flex flex-col gap-8" onSubmit={handleSubmit}>
        <fieldset className="m-0 flex min-w-0 flex-col gap-8 border-0 p-0 disabled:opacity-60" disabled={saving}>
          <SettingsSection title="Gatilho">
            <Field label="Nome"><input className={fieldControlClassName} autoFocus required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></Field>
            <Field label="Pedido"><textarea className={`${fieldControlClassName} field-sizing-content min-h-32 resize-y font-normal`} required rows={5} value={draft.instruction} onChange={(event) => setDraft({ ...draft, instruction: event.target.value })} /><span className="text-support font-normal text-muted">Descreva o trabalho e onde entregar o resultado: aqui na conversa ou em um comentário no GitHub.</span></Field>
          </SettingsSection>
          <SettingsSection title="Quando chamar o Bot">
            <Field label="Repositórios" as="div"><p className="m-0 break-words font-normal">{trigger.repositories.map((repository) => repository.fullName).join(", ")}</p><span className="text-support font-normal text-muted">Vinculados à conta deste gatilho.</span></Field>
            <Field label="Evento"><Select value={draft.event} onChange={(event) => {
              const option = triggerEvents.find((candidate) => candidate.value === event.target.value)

              if (option) {
                setDraft({ ...draft, event: option.value, actions: [] })
              }
            }}>{triggerEvents.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</Select></Field>
            <Field label="Disparar quando" as="div">
              <div className="flex flex-wrap gap-2" role="group" aria-label="Ações do evento" aria-describedby="trigger-actions-help">{primaryActions.map((action) => <ToggleChip key={action} pressed={draft.actions.includes(action)} onClick={() => toggleAction(action)}>{triggerActionLabels[action] ?? action}</ToggleChip>)}</div>
              {moreActions.length > 0 && <details><summary className="cursor-pointer text-support font-normal text-muted hover:text-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">Mais ações{moreActions.some((action) => draft.actions.includes(action)) ? " · com seleção" : ""}</summary><div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Mais ações do evento">{moreActions.map((action) => <ToggleChip key={action} pressed={draft.actions.includes(action)} onClick={() => toggleAction(action)}>{triggerActionLabels[action] ?? action}</ToggleChip>)}</div></details>}
              <span id="trigger-actions-help" className={`text-support font-normal ${draft.actions.length ? "text-muted" : "text-status-error"}`}>Selecione uma ou mais ações.</span>
            </Field>
            <Field label="Labels necessárias" optional><input className={fieldControlClassName} placeholder="bug, prioridade-alta" value={draft.labels} onChange={(event) => setDraft({ ...draft, labels: event.target.value })} /><span className="text-support font-normal text-muted">Separe por vírgulas. Vazio aceita qualquer label; preenchido exige todas.</span></Field>
            <div className="flex items-center justify-between gap-4"><div><p id="trigger-own-label" className="m-0 text-control text-secondary">Incluir eventos gerados pelo Jolt</p><p id="trigger-own-help" className="m-0 mt-1 text-support text-muted">Permite que ações do próprio Jolt disparem este gatilho.</p></div><Switch aria-labelledby="trigger-own-label" aria-describedby="trigger-own-help" checked={draft.includeOwnEvents} onChange={(includeOwnEvents) => setDraft({ ...draft, includeOwnEvents })} /></div>
          </SettingsSection>
        </fieldset>
      </form>
    </BotPage>
  )
}
