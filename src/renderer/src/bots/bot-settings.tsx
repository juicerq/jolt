import { FolderIcon, XMarkIcon } from "@heroicons/react/24/outline"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import type { Bot } from "../../../shared/bots"
import type { EngineClient } from "../engine-client"

export function BotSettings({ bot, client, onClose }: { bot: Bot; client: EngineClient; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [projectId, setProjectId] = useState(bot.projectId ?? "")
  const [workingDirectoryOverride, setWorkingDirectoryOverride] = useState(bot.workingDirectoryOverride ?? "")
  const [directoryError, setDirectoryError] = useState<string>()
  const { data: projectGroups, error: projectsError } = useQuery(client.query.projects.list.queryOptions())
  const selectedProject = projectGroups?.projects.find((project) => project.id === projectId)
  const { mutate, isPending, error } = useMutation(client.query.bots.updateWorkspace.mutationOptions({
    onSuccess(updated) {
      queryClient.invalidateQueries({ queryKey: client.query.bots.get.queryOptions({ input: { id: updated.id } }).queryKey })
      queryClient.invalidateQueries({ queryKey: client.query.projects.list.queryOptions().queryKey })
      onClose()
    },
  }))

  async function handleChooseDirectory() {
    setDirectoryError(undefined)
    const selected = await window.desktop.chooseWorkingDirectory().catch((selectionError: unknown) => {
      setDirectoryError(selectionError instanceof Error ? selectionError.message : "Não foi possível abrir a pasta")
      return null
    })

    if (selected) {
      setWorkingDirectoryOverride(selected)
    }
  }

  return (
    <div className="prototype-overlay panel-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="function-drawer bot-settings-drawer">
        <button className="settings-close" type="button" aria-label="Fechar configurações" onClick={onClose}><XMarkIcon aria-hidden="true" /></button>
        <header className="bot-summary-heading"><div><p className="eyebrow">Bot</p><h2>{bot.name}</h2></div><span className="provider-chip">Pi · Codex</span></header>
        <section className="leader-card">
          <p className="eyebrow">Função</p>
          <dl className="leader-function">
            <div><dt>Resultado</dt><dd>{bot.function.outcome}</dd></div>
            <div><dt>Responsabilidades</dt><dd>{bot.function.responsibilities}</dd></div>
            <div><dt>Limites</dt><dd>{bot.function.limits}</dd></div>
            <div><dt>Entrega</dt><dd>{bot.function.delivery}</dd></div>
          </dl>
        </section>
        <section className="leader-card bot-workspace-settings">
          <p className="eyebrow">Projeto e pasta</p>
          <label>Projeto<select value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">Sem projeto</option>{projectGroups?.projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label>
          <div className="project-directory-field bot-directory-field">
            <span>Pasta própria <small>Opcional</small></span>
            <button className="directory-picker" type="button" onClick={handleChooseDirectory}><FolderIcon aria-hidden="true" /><span>{workingDirectoryOverride || "Usar outra pasta"}</span></button>
            {workingDirectoryOverride && <button className="text-button directory-reset" type="button" onClick={() => setWorkingDirectoryOverride("")}>Remover pasta própria</button>}
          </div>
          <WorkspaceChoice projectName={selectedProject?.name} workingDirectoryOverride={workingDirectoryOverride} />
          <div className="effective-directory"><span>Pasta efetiva atual</span><strong>{bot.effectiveWorkingDirectory}</strong></div>
          {(directoryError || projectsError || error) && <p className="error">Falha ao alterar o Projeto: {directoryError ?? projectsError?.message ?? error?.message}</p>}
          <button type="button" disabled={isPending} onClick={() => mutate({ id: bot.id, projectId: projectId || null, workingDirectoryOverride: workingDirectoryOverride || null })}>{isPending ? "Salvando..." : "Salvar alterações"}</button>
        </section>
      </aside>
    </div>
  )
}

function WorkspaceChoice({ projectName, workingDirectoryOverride }: { projectName?: string; workingDirectoryOverride: string }) {
  if (workingDirectoryOverride) {
    return <p className="workspace-choice">Ao salvar, o Bot usará a pasta própria.</p>
  }

  if (projectName) {
    return <p className="workspace-choice">Ao salvar, o Bot herdará a pasta de {projectName}.</p>
  }

  return <p className="workspace-choice">Ao salvar, o Bot usará sua pasta privada.</p>
}
