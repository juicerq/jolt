import { FolderIcon, XMarkIcon } from "@heroicons/react/24/outline"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import type { Bot } from "../../../shared/bots"
import type { EngineClient } from "../engine-client"
import { IconButton } from "../ui/icon-button"

const eyebrowClassName = "mb-[1em] text-metadata font-semibold tracking-[0.08em] text-muted uppercase"
const cardClassName = "rounded-xl border border-outline bg-surface p-5"
const fieldControlClassName =
  "w-full rounded-lg border border-outline-strong bg-canvas px-3 py-2.5 text-control font-medium text-primary focus-visible:border-focus focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
const textButtonClassName =
  "cursor-pointer rounded-lg bg-transparent text-control font-medium text-muted hover:bg-surface-hover hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring active:bg-surface-active"
const directoryPickerClassName =
  "flex w-full min-w-0 cursor-pointer items-center gap-2.5 rounded-lg border border-outline-strong bg-canvas px-3 py-[11px] text-left text-control font-medium text-secondary hover:border-focus hover:bg-surface-hover hover:text-primary focus-visible:border-focus focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring active:bg-surface-active [&_svg]:size-[17px] [&_svg]:shrink-0"
const functionTermClassName = "mb-1.5 text-metadata font-semibold tracking-[0.08em] text-muted uppercase"
const functionDescriptionClassName = "m-0 whitespace-pre-wrap text-control font-medium leading-[1.55] text-focus"

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
    <div className="fixed inset-0 z-40 grid place-items-center justify-items-end bg-overlay p-3 backdrop-blur-sm" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="relative flex h-full w-[min(390px,100%)] flex-col gap-4 overflow-y-auto rounded-shell border border-outline-strong bg-surface-raised p-6 text-primary shadow-[0_24px_80px_rgb(0_0_0/55%)]">
        <IconButton className="top-6 right-6 z-1" position="absolute" size={30} type="button" label="Fechar configurações" tooltipPlacement="left" onClick={onClose}><XMarkIcon aria-hidden="true" /></IconButton>
        <header className="flex items-start justify-between gap-4 pr-9"><div><p className={eyebrowClassName}>Bot</p><h2 className="text-title font-semibold text-primary">{bot.name}</h2></div><span className="rounded-full border border-outline-strong px-2.5 py-1.5 text-support font-semibold text-focus">Pi · Codex</span></header>
        <section className={cardClassName}>
          <p className={eyebrowClassName}>Função</p>
          <dl className="mt-5 grid grid-cols-1 gap-[18px]">
            <div className="block border-b border-outline py-[15px]"><dt className={functionTermClassName}>Resultado</dt><dd className={functionDescriptionClassName}>{bot.function.outcome}</dd></div>
            {bot.function.description && <div className="block border-b border-outline py-[15px]"><dt className={functionTermClassName}>Descrição</dt><dd className={`${functionDescriptionClassName} whitespace-pre-line`}>{bot.function.description}</dd></div>}
          </dl>
        </section>
        <section className={`${cardClassName} flex flex-col gap-4`}>
          <p className={eyebrowClassName}>Projeto e pasta</p>
          <label className="flex flex-col gap-2 text-control font-semibold text-secondary">Projeto<select className={fieldControlClassName} value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">Sem projeto</option>{projectGroups?.projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label>
          <div className="flex min-w-0 flex-col gap-2 rounded-xl border border-outline bg-surface p-4">
            <span className="flex items-baseline justify-between text-control font-semibold text-secondary">Pasta própria <small className="text-metadata font-medium text-muted">Opcional</small></span>
            <button className={directoryPickerClassName} type="button" onClick={handleChooseDirectory}><FolderIcon aria-hidden="true" /><span className="min-w-0 truncate">{workingDirectoryOverride || "Usar outra pasta"}</span></button>
            {workingDirectoryOverride && <button className={`${textButtonClassName} self-start px-2 py-1.5`} type="button" onClick={() => setWorkingDirectoryOverride("")}>Remover pasta própria</button>}
          </div>
          <WorkspaceChoice projectName={selectedProject?.name} workingDirectoryOverride={workingDirectoryOverride} />
          <div className="flex min-w-0 flex-col gap-1.25 border-t border-outline pt-4"><span className="text-metadata font-semibold tracking-[0.08em] text-muted uppercase">Pasta efetiva atual</span><strong className="font-mono text-support font-medium text-secondary [overflow-wrap:anywhere]">{bot.effectiveWorkingDirectory}</strong></div>
          {(directoryError || projectsError || error) && <p className="text-support text-status-error">Falha ao alterar o Projeto: {directoryError ?? projectsError?.message ?? error?.message}</p>}
          <button className="cursor-pointer rounded-lg bg-accent px-3.5 py-2.5 text-control font-semibold text-accent-ink hover:bg-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring active:bg-focus disabled:cursor-default disabled:bg-surface-active disabled:text-muted disabled:opacity-100" type="button" disabled={isPending} onClick={() => mutate({ id: bot.id, projectId: projectId || null, workingDirectoryOverride: workingDirectoryOverride || null })}>{isPending ? "Salvando..." : "Salvar alterações"}</button>
        </section>
      </aside>
    </div>
  )
}

function WorkspaceChoice({ projectName, workingDirectoryOverride }: { projectName?: string; workingDirectoryOverride: string }) {
  if (workingDirectoryOverride) {
    return <p className="text-support text-secondary">Ao salvar, o Bot usará a pasta própria.</p>
  }

  if (projectName) {
    return <p className="text-support text-secondary">Ao salvar, o Bot herdará a pasta de {projectName}.</p>
  }

  return <p className="text-support text-secondary">Ao salvar, o Bot usará sua pasta privada.</p>
}
