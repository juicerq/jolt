import { LinkIcon, TrashIcon } from "@heroicons/react/24/outline"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { type FormEvent, useState } from "react"
import type { Bot } from "@src/shared/bots"
import type { Project } from "@src/shared/projects"
import { BotFace } from "./bot-face"
import type { EngineClient } from "../engine-client"
import { Button } from "../ui/button"
import { DirectoryPicker, useDirectoryChooser } from "../ui/directory-picker"
import { ConfirmationDialog } from "../ui/dialog"
import { Field, fieldControlClassName } from "../ui/field"
import { Switch } from "../ui/switch"
import { Select } from "../ui/select"
import { SettingsRow, SettingsSection, settingsPanelClassName } from "../ui/settings-section"
import { useEscape } from "../ui/use-escape"
import { BotColleagues } from "./bot-colleagues"
import { BotPage, BotPageSaveBar } from "./bot-page"
import { BotPlugins } from "./bot-plugins"
import { forgetBot } from "./bots-store"
import { teamOf } from "./team"
import { BotDetachMember } from "./bot-detach-member"

interface SettingsDraft { name: string; outcome: string; description: string; projectId: string; workingDirectoryOverride: string; inheritMemberPermissions: boolean }

const headerLineClassName = "border-0 bg-transparent placeholder:text-muted focus-visible:outline-none -mx-2 field-sizing-content max-w-full self-start rounded-md px-2 hover:bg-surface-hover focus-visible:bg-surface-hover disabled:bg-transparent"

function draftOf(bot: Bot): SettingsDraft {
  return { name: bot.name, outcome: bot.function.outcome, description: bot.function.description ?? "", projectId: bot.projectId ?? "", workingDirectoryOverride: bot.workingDirectoryOverride ?? "", inheritMemberPermissions: bot.inheritMemberPermissions }
}

function settingsChange(bot: Bot, draft: SettingsDraft) {
  const name = draft.name.trim()
  const outcome = draft.outcome.trim()
  const description = draft.description.trim()
  const unchanged = name === bot.name
    && outcome === bot.function.outcome
    && description === (bot.function.description ?? "")
    && draft.inheritMemberPermissions === bot.inheritMemberPermissions
    && draft.projectId === (bot.projectId ?? "")
    && draft.workingDirectoryOverride === (bot.workingDirectoryOverride ?? "")

  if (unchanged) {
    return
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
      inheritMemberPermissions: draft.inheritMemberPermissions,
    },
  }
}

export function BotSettings({ bot, client, onClose }: { bot: Bot; client: EngineClient; onClose: () => void }) {
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
      void queryClient.invalidateQueries({ queryKey: client.query.projects.key() })
      onClose()
    },
  }))
  const { mutate: remove, isPending: removing, error: removeError } = useMutation(client.query.bots.remove.mutationOptions({
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: client.query.projects.key() })
      void queryClient.invalidateQueries({ queryKey: client.query.plugins.key() })
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
          <BotFace className="size-16 flex-none" name={bot.avatarSeed} botId={bot.id} size={64} />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <label className="sr-only" htmlFor="bot-settings-name">Nome</label>
            <input className={`${headerLineClassName} text-title font-semibold text-primary placeholder:font-normal`} id="bot-settings-name" autoComplete="off" placeholder="Nome do Bot" value={draft.name} disabled={confirmingRemoval} onChange={(event) => patch({ name: event.target.value })} />
            <label className="sr-only" htmlFor="bot-settings-outcome">Resultado esperado</label>
            <input className={`${headerLineClassName} text-control font-medium text-secondary max-md:text-base`} id="bot-settings-outcome" autoComplete="off" placeholder="O que ele entrega?" title="Resultado esperado" value={draft.outcome} disabled={confirmingRemoval} onChange={(event) => patch({ outcome: event.target.value })} />
          </div>
        </header>
        <SettingsSection title="Função">
          <div className={settingsPanelClassName}>
            <Field label="Descrição" optional><textarea className={`${fieldControlClassName} field-sizing-content max-h-48 min-h-20 resize-none font-normal`} placeholder="Responsabilidades, limites e forma de entrega" rows={3} value={draft.description} disabled={confirmingRemoval} onChange={(event) => patch({ description: event.target.value })} /></Field>
          </div>
        </SettingsSection>
        <SettingsSection title="Trabalho">
          <div className={`${settingsPanelClassName} flex flex-col gap-4`}>
            {leader
              ? (
                <Field label="Vínculo" as="div">
                  <div className="flex items-center gap-3">
                    <BotFace className="size-8 min-w-8" name={leader.avatarSeed} botId={leader.id} size={32} />
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
              <WorkspaceHint project={selectedProject} workingDirectoryOverride={draft.workingDirectoryOverride} />
            </Field>
          </div>
        </SettingsSection>
        {!bot.leaderBotId && <MemberPermissionDefault checked={draft.inheritMemberPermissions} disabled={confirmingRemoval} onChange={(inheritMemberPermissions) => patch({ inheritMemberPermissions })} />}
        {failure && <p className="m-0 text-support text-status-error">Falha nas configurações: {failure}</p>}
      </form>
      <BotPlugins bot={bot} client={client} />
      {!bot.temporary && <BotColleagues bot={bot} client={client} groups={projectGroups} />}
      {leader && <BotDetachMember bot={bot} leader={leader} client={client} />}
      <section className="flex justify-end" aria-label="Excluir Bot">
        <Button className="inline-flex items-center gap-2" variant="danger" type="button" onClick={() => setConfirmingRemoval(true)}><TrashIcon className="size-4" aria-hidden="true" />Excluir Bot</Button>
      </section>
      {confirmingRemoval && (
        <ConfirmationDialog
          icon={<TrashIcon />}
          title="Excluir Bot"
          onClose={() => !removing && setConfirmingRemoval(false)}
          actions={(
            <>
              <Button variant="text" type="button" autoFocus disabled={removing} onClick={() => setConfirmingRemoval(false)}>Cancelar</Button>
              <Button variant="danger" type="button" disabled={removing} onClick={() => remove({ id: bot.id })}>{removing ? "Excluindo..." : "Excluir Bot"}</Button>
            </>
          )}
        >
          <BotRemovalDetails bot={bot} members={members} />
          {removeError && <p className="m-0 text-support text-status-error">Falha ao excluir o Bot: {removeError.message}</p>}
        </ConfirmationDialog>
      )}
    </BotPage>
  )
}

function WorkspaceHint({ project, workingDirectoryOverride }: { project?: Pick<Project, "name" | "defaultWorkingDirectory">; workingDirectoryOverride: string }) {
  if (workingDirectoryOverride) {
    return <small className="text-support font-normal text-muted">O Bot usará esta pasta para trabalhar.</small>
  }

  if (project?.defaultWorkingDirectory) {
    return <small className="text-support font-normal text-muted">Pasta de {project.name}: <span className="font-mono [overflow-wrap:anywhere]">{project.defaultWorkingDirectory}</span></small>
  }

  return <small className="text-support font-normal text-muted">O Bot usará uma pasta privada do Mimo até você escolher outra.</small>
}

function BotRemovalDetails({ bot, members }: { bot: Pick<Bot, "name">; members: Bot[] }) {
  return <>
    <p className="m-0 text-control text-secondary">Excluir {bot.name} apaga sua conversa, sua memória e seu Diretório privado. Não é possível desfazer.</p>
    {members.length > 0 && <>
      <p className="m-0 text-control text-secondary">Também exclui {members.length} {members.length === 1 ? "Integrante, com sua conversa, memória e Diretório privado:" : "Integrantes, com suas conversas, memórias e Diretórios privados:"}</p>
      <ul className="m-0 max-h-48 overflow-y-auto pl-5 text-control text-secondary">
        {members.map((member) => <li key={member.id}>{member.name}{member.closed ? " · Temporário encerrado" : ""}</li>)}
      </ul>
    </>}
  </>
}

function MemberPermissionDefault({ checked, disabled, onChange }: { checked: boolean; disabled: boolean; onChange: (checked: boolean) => void }) {
  return <SettingsSection title="Novos integrantes">
    <div className={settingsPanelClassName}>
      <SettingsRow label="Herdar permissão" description={checked ? "Contratações começam com a permissão deste Líder." : "Contratações começam em Perguntar. O Líder pode escolher uma permissão até o próprio limite."}>
        <Switch checked={checked} disabled={disabled} aria-label="Herdar permissão" onChange={onChange} />
      </SettingsRow>
    </div>
  </SettingsSection>
}
