import { Blobatar } from "@blobatar/react"
import { LinkIcon, XMarkIcon } from "@heroicons/react/24/outline"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { type FormEvent, useState } from "react"
import type { Bot } from "../../../shared/bots"
import type { projectSchemas } from "../../../shared/projects"
import type { EngineClient } from "../engine-client"
import { Button } from "../ui/button"
import { useDirectoryChooser } from "../ui/directory-picker"
import { IconButton } from "../ui/icon-button"
import { Select } from "../ui/select"
import { useEscape } from "../ui/use-escape"
import { EditableLine, FolderChip, editableLineClassName, revealClassName } from "./bot-form"
import { forgetBot } from "./bots-store"
import { WorkspaceHint } from "./workspace-hint"

type ProjectGroups = typeof projectSchemas.groupedList.infer

function teamOf(groups: ProjectGroups | undefined, bot: Bot) {
  const leaders = groups ? [...groups.projects.flatMap((project) => project.bots), ...groups.unassignedBots] : []
  const leader = bot.leaderBotId ? leaders.find((candidate) => candidate.id === bot.leaderBotId) : undefined
  const members = leaders.find((candidate) => candidate.id === bot.id)?.members.filter((member) => !member.closed) ?? []

  return { leader, members }
}

export function BotSettings({ bot, client, onClose }: { bot: Bot; client: EngineClient; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(bot.name)
  const [outcome, setOutcome] = useState(bot.function.outcome)
  const [description, setDescription] = useState(bot.function.description ?? "")
  const [projectId, setProjectId] = useState(bot.projectId ?? "")
  const [workingDirectoryOverride, setWorkingDirectoryOverride] = useState(bot.workingDirectoryOverride ?? "")
  const [confirmingRemoval, setConfirmingRemoval] = useState(false)
  const directory = useDirectoryChooser(setWorkingDirectoryOverride)
  const { data: projectGroups, error: projectsError } = useQuery(client.query.projects.list.queryOptions())
  const projects = projectGroups?.projects ?? []
  const selectedProject = projects.find((project) => project.id === projectId)
  const { leader, members } = teamOf(projectGroups, bot)
  const { mutate: save, isPending: saving, error: saveError } = useMutation(client.query.bots.update.mutationOptions({
    onSuccess(updated) {
      queryClient.invalidateQueries({ queryKey: client.query.bots.get.queryOptions({ input: { id: updated.id } }).queryKey })
      queryClient.invalidateQueries({ queryKey: client.query.bots.list.queryOptions().queryKey })
      queryClient.invalidateQueries({ queryKey: client.query.projects.list.queryOptions().queryKey })
      onClose()
    },
  }))
  const { mutate: remove, isPending: removing, error: removeError } = useMutation(client.query.bots.remove.mutationOptions({
    onSuccess() {
      queryClient.removeQueries({ queryKey: client.query.bots.get.queryKey({ input: { id: bot.id } }) })
      queryClient.invalidateQueries({ queryKey: client.query.bots.list.queryOptions().queryKey })
      queryClient.invalidateQueries({ queryKey: client.query.projects.list.queryOptions().queryKey })
      forgetBot(bot.id)
    },
  }))
  const trimmedName = name.trim()
  const trimmedOutcome = outcome.trim()
  const trimmedDescription = description.trim()
  const changed = trimmedName !== bot.name
    || trimmedOutcome !== bot.function.outcome
    || trimmedDescription !== (bot.function.description ?? "")
    || projectId !== (bot.projectId ?? "")
    || workingDirectoryOverride !== (bot.workingDirectoryOverride ?? "")
  const failure = directory.error ?? projectsError?.message ?? saveError?.message
  useEscape(onClose)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!changed || !trimmedName || !trimmedOutcome) {
      return
    }

    save({
      id: bot.id,
      name: trimmedName,
      function: { outcome: trimmedOutcome, ...(trimmedDescription ? { description: trimmedDescription } : {}) },
      projectId: projectId || null,
      workingDirectoryOverride: workingDirectoryOverride || null,
    })
  }

  return (
    <section className="relative grid h-full min-h-0 overflow-y-auto bg-surface" aria-label={`Configurações de ${bot.name}`}>
      <IconButton className="top-2.5 right-[var(--window-controls-clearance)] z-2" iconSize={16} position="absolute" type="button" label="Fechar configurações" tooltipPlacement="left" onClick={onClose}><XMarkIcon aria-hidden="true" /></IconButton>
      <form className="mx-auto mt-[18vh] mb-auto flex w-[min(520px,calc(100%-48px))] flex-col items-center gap-2 pb-12 text-center" onSubmit={handleSubmit}>
        <Blobatar className="size-16 flex-none rounded-[18px] border border-outline-strong bg-surface-raised" name={`jolt:${bot.id}:${bot.name}`} size={64} alt="" />
        <label className="sr-only" htmlFor="bot-settings-name">Nome</label>
        <div className="mt-4 mb-1.5 flex max-w-full"><EditableLine><input className={`${editableLineClassName} text-title font-semibold text-primary placeholder:font-normal`} id="bot-settings-name" autoComplete="off" placeholder="Nome do Bot" value={name} disabled={confirmingRemoval} onChange={(event) => setName(event.target.value)} /></EditableLine></div>
        <label className="sr-only" htmlFor="bot-settings-outcome">Resultado esperado</label>
        <EditableLine><input className={`${editableLineClassName} text-support text-secondary`} id="bot-settings-outcome" autoComplete="off" placeholder="O que ele entrega?" value={outcome} disabled={confirmingRemoval} onChange={(event) => setOutcome(event.target.value)} /></EditableLine>
        <label className="sr-only" htmlFor="bot-settings-description">Descrição</label>
        <EditableLine><textarea className={`${editableLineClassName} max-h-40 resize-none text-support text-muted`} id="bot-settings-description" placeholder="Responsabilidades, limites e forma de entrega" rows={1} value={description} disabled={confirmingRemoval} onChange={(event) => setDescription(event.target.value)} /></EditableLine>
        {confirmingRemoval
          ? <BotRemoval bot={bot} members={members} removing={removing} failure={removeError?.message} onCancel={() => setConfirmingRemoval(false)} onConfirm={() => remove({ id: bot.id })} />
          : (
            <>
              <div className="mt-6 flex w-[280px] flex-col gap-2">
                {leader
                  ? <span className="text-support font-medium text-muted">Integrante de {leader.name}</span>
                  : (
                    <label>
                      <span className="sr-only">Projeto</span>
                      <Select icon={<LinkIcon />} value={projectId} onChange={(event) => setProjectId(event.target.value)}>
                        <option value="">Sem projeto</option>
                        {projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}
                      </Select>
                    </label>
                  )}
                <FolderChip value={workingDirectoryOverride} onChoose={directory.choose} onClear={() => setWorkingDirectoryOverride("")} />
                <WorkspaceHint source={selectedProject && { name: selectedProject.name, directory: selectedProject.defaultWorkingDirectory }} workingDirectoryOverride={workingDirectoryOverride} />
                <Button className="mt-4" type="submit" disabled={saving || !changed || !trimmedName || !trimmedOutcome}>{saving ? "Salvando..." : "Salvar alterações"}</Button>
              </div>
              {failure && <p className="m-0 text-support text-status-error">Falha ao salvar o Bot: {failure}</p>}
              <Button className="mt-8 hover:text-status-error focus-visible:text-status-error" variant="text" type="button" onClick={() => setConfirmingRemoval(true)}>Excluir Bot</Button>
            </>
          )}
      </form>
    </section>
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
    <div className={`${revealClassName} mt-6 flex w-[min(360px,100%)] flex-col items-center gap-4`}>
      <p className="m-0 text-control font-medium text-secondary">Excluir {bot.name} apaga a conversa e a memória{teamNote(members)}. Não é possível desfazer.</p>
      <div className="flex gap-2">
        <Button variant="text" type="button" autoFocus disabled={removing} onClick={onCancel}>Cancelar</Button>
        <Button variant="danger" type="button" disabled={removing} onClick={onConfirm}>{removing ? "Excluindo..." : "Excluir Bot"}</Button>
      </div>
      {failure && <p className="m-0 text-support text-status-error">Falha ao excluir o Bot: {failure}</p>}
    </div>
  )
}
