import { Blobatar } from "@blobatar/react"
import { BookOpenIcon, ClockIcon, LinkIcon, TrashIcon } from "@heroicons/react/24/outline"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { type FormEvent, useState } from "react"
import type { Bot } from "../../../shared/bots"
import type { EngineClient } from "../engine-client"
import { Button } from "../ui/button"
import { DirectoryPicker, useDirectoryChooser } from "../ui/directory-picker"
import { Field, fieldControlClassName } from "../ui/field"
import { Select } from "../ui/select"
import { useEscape } from "../ui/use-escape"
import { lineClassName, revealClassName } from "./bot-form"
import { BotColleagues } from "./bot-colleagues"
import { BotPage, BotPageSaveBar } from "./bot-page"
import { BotPlugins } from "./bot-plugins"
import { BotSettingsSection } from "./bot-settings-section"
import { forgetBot } from "./bots-store"
import { teamOf } from "./team"
import { WorkspaceHint } from "./workspace-hint"

export type SettingsDraft = { name: string; outcome: string; description: string; projectId: string; workingDirectoryOverride: string }

const headerLineClassName = `${lineClassName} -mx-2 w-[calc(100%+16px)] rounded-md px-2 hover:bg-surface-hover focus-visible:bg-surface-hover disabled:bg-transparent`

export function draftOf(bot: Bot): SettingsDraft {
  return { name: bot.name, outcome: bot.function.outcome, description: bot.function.description ?? "", projectId: bot.projectId ?? "", workingDirectoryOverride: bot.workingDirectoryOverride ?? "" }
}

export function settingsChange(bot: Bot, draft: SettingsDraft) {
  const name = draft.name.trim()
  const outcome = draft.outcome.trim()
  const description = draft.description.trim()
  const unchanged = name === bot.name
    && outcome === bot.function.outcome
    && description === (bot.function.description ?? "")
    && draft.projectId === (bot.projectId ?? "")
    && draft.workingDirectoryOverride === (bot.workingDirectoryOverride ?? "")

  if (unchanged) {
    return undefined
  }

  return {
    complete: !!name && !!outcome,
    input: {
      id: bot.id,
      name,
      function: { outcome, ...(description ? { description } : {}) },
      projectId: draft.projectId || null,
      workingDirectoryOverride: draft.workingDirectoryOverride || null,
      memoryEnabled: bot.memoryEnabled,
      effort: bot.effort,
      model: bot.model,
      permissionMode: bot.permissionMode,
    },
  }
}

export function BotSettings({ bot, client, onClose, onOpenRoutines, onOpenMemory }: { bot: Bot; client: EngineClient; onClose: () => void; onOpenRoutines: () => void; onOpenMemory: () => void }) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState(() => draftOf(bot))
  const [confirmingRemoval, setConfirmingRemoval] = useState(false)
  const patch = (fields: Partial<SettingsDraft>) => setDraft((current) => ({ ...current, ...fields }))
  const directory = useDirectoryChooser((workingDirectoryOverride) => patch({ workingDirectoryOverride }))
  const { data: projectGroups, error: projectsError } = useQuery(client.query.projects.list.queryOptions())
  const projects = projectGroups?.projects ?? []
  const selectedProject = projects.find((project) => project.id === draft.projectId)
  const { leader, members } = teamOf(projectGroups, bot)
  const { mutate: save, isPending: saving, error: saveError } = useMutation(client.query.bots.update.mutationOptions({
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: client.query.projects.list.queryOptions().queryKey })
      onClose()
    },
  }))
  const { mutate: remove, isPending: removing, error: removeError } = useMutation(client.query.bots.remove.mutationOptions({
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: client.query.projects.list.queryOptions().queryKey })
      queryClient.invalidateQueries({ queryKey: client.query.plugins.list.queryOptions().queryKey })
      forgetBot(bot.id)
    },
  }))
  const change = settingsChange(bot, draft)
  const failure = directory.error ?? projectsError?.message
  useEscape(onClose)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!change?.complete) {
      return
    }

    save(change.input)
  }

  return (
    <BotPage label={`Configurações de ${bot.name}`} footer={change ? <BotPageSaveBar form="bot-settings" complete={change.complete} saving={saving} {...(saveError ? { failure: `Falha ao salvar o Bot: ${saveError.message}` } : {})} onDiscard={() => setDraft(draftOf(bot))} /> : undefined}>
      <form className="flex flex-col gap-8" id="bot-settings" onSubmit={handleSubmit}>
        <header className="flex items-center gap-4">
          <Blobatar className="size-16 flex-none rounded-[18px] border border-outline-strong bg-surface-raised" name={`jolt:${bot.id}:${bot.name}`} size={64} alt="" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <label className="sr-only" htmlFor="bot-settings-name">Nome</label>
            <input className={`${headerLineClassName} text-title font-semibold text-primary placeholder:font-normal`} id="bot-settings-name" autoComplete="off" placeholder="Nome do Bot" value={draft.name} disabled={confirmingRemoval} onChange={(event) => patch({ name: event.target.value })} />
            <label className="sr-only" htmlFor="bot-settings-outcome">Resultado esperado</label>
            <input className={`${headerLineClassName} text-control font-medium text-secondary`} id="bot-settings-outcome" autoComplete="off" placeholder="O que ele entrega?" title="Resultado esperado" value={draft.outcome} disabled={confirmingRemoval} onChange={(event) => patch({ outcome: event.target.value })} />
          </div>
        </header>
        <BotSettingsSection title="Função">
          <Field label="Descrição" optional><textarea className={`${fieldControlClassName} field-sizing-content max-h-48 min-h-20 resize-none font-normal`} placeholder="Responsabilidades, limites e forma de entrega" rows={3} value={draft.description} disabled={confirmingRemoval} onChange={(event) => patch({ description: event.target.value })} /></Field>
        </BotSettingsSection>
        <BotSettingsSection title="Trabalho">
          {leader
            ? (
              <Field label="Vínculo" as="div">
                <div className="flex items-center gap-3">
                  <Blobatar className="size-8 min-w-8 rounded-[10px] border border-outline-strong bg-surface-raised" name={`jolt:${leader.id}:${leader.name}`} size={32} alt="" />
                  <p className="m-0 text-control font-medium text-secondary">Integrante de {leader.name}</p>
                </div>
              </Field>
            )
            : (
              <Field label="Projeto">
                <Select icon={<LinkIcon />} value={draft.projectId} disabled={confirmingRemoval} onChange={(event) => patch({ projectId: event.target.value })}>
                  <option value="">Sem projeto</option>
                  {projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}
                </Select>
              </Field>
            )}
          <Field label="Pasta própria" optional as="div">
            <DirectoryPicker value={draft.workingDirectoryOverride} placeholder="Escolher pasta" onChoose={directory.choose} onClear={() => patch({ workingDirectoryOverride: "" })} />
            <WorkspaceHint source={selectedProject && { name: selectedProject.name, directory: selectedProject.defaultWorkingDirectory }} workingDirectoryOverride={draft.workingDirectoryOverride} />
          </Field>
        </BotSettingsSection>
        {failure && <p className="m-0 text-support text-status-error">Falha nas configurações: {failure}</p>}
      </form>
      <div className="flex gap-2">
        {!bot.temporary && (
          <Button className="inline-flex items-center gap-2" variant="secondary" type="button" onClick={onOpenRoutines}>
            <ClockIcon className="size-4" aria-hidden="true" />Rotinas
          </Button>
        )}
        <Button className="inline-flex items-center gap-2" variant="secondary" type="button" onClick={onOpenMemory}>
          <BookOpenIcon className="size-4" aria-hidden="true" />Memória
        </Button>
      </div>
      <BotPlugins bot={bot} client={client} />
      {!bot.temporary && <BotColleagues bot={bot} client={client} groups={projectGroups} />}
      <section className="flex flex-col items-start gap-4 border-t border-outline pt-6" aria-label="Excluir Bot">
        {confirmingRemoval
          ? <BotRemoval bot={bot} members={members} removing={removing} failure={removeError?.message} onCancel={() => setConfirmingRemoval(false)} onConfirm={() => remove({ id: bot.id })} />
          : <Button className="inline-flex items-center gap-2" variant="danger" type="button" onClick={() => setConfirmingRemoval(true)}><TrashIcon className="size-4" aria-hidden="true" />Excluir Bot</Button>}
      </section>
    </BotPage>
  )
}

function teamNote(members: Bot[]) {
  const names = members.map((member) => member.name).join(", ")

  if (members.length === 0) {
    return ""
  }

  if (members.length === 1) {
    return ` e também exclui o Integrante ${names}`
  }

  return ` e também exclui ${members.length} Integrantes: ${names}`
}

function BotRemoval({ bot, members, removing, failure, onCancel, onConfirm }: { bot: Bot; members: Bot[]; removing: boolean; failure?: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className={`${revealClassName} flex flex-col items-start gap-4`}>
      <p className="m-0 text-control font-medium text-secondary">Excluir {bot.name} apaga a conversa e a memória{teamNote(members)}. Não é possível desfazer.</p>
      <div className="flex gap-2">
        <Button variant="text" type="button" autoFocus disabled={removing} onClick={onCancel}>Cancelar</Button>
        <Button variant="danger" type="button" disabled={removing} onClick={onConfirm}>{removing ? "Excluindo..." : "Excluir Bot"}</Button>
      </div>
      {failure && <p className="m-0 text-support text-status-error">Falha ao excluir o Bot: {failure}</p>}
    </div>
  )
}
