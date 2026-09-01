import { XMarkIcon } from "@heroicons/react/24/outline"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import type { Bot } from "../../../shared/bots"
import type { EngineClient } from "../engine-client"
import { Button } from "../ui/button"
import { DirectoryPicker, useDirectoryChooser } from "../ui/directory-picker"
import { Field, fieldControlClassName } from "../ui/field"
import { IconButton } from "../ui/icon-button"
import { WorkspaceHint } from "./workspace-hint"

const eyebrowClassName = "mb-[1em] text-metadata font-semibold tracking-[0.08em] text-muted uppercase"
const cardClassName = "rounded-xl border border-outline bg-surface p-5"
const functionTermClassName = "mb-1.5 text-metadata font-semibold tracking-[0.08em] text-muted uppercase"
const functionDescriptionClassName = "m-0 whitespace-pre-wrap text-control font-medium leading-[1.55] text-focus"

export function BotSettings({ bot, client, onClose }: { bot: Bot; client: EngineClient; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [projectId, setProjectId] = useState(bot.projectId ?? "")
  const [workingDirectoryOverride, setWorkingDirectoryOverride] = useState(bot.workingDirectoryOverride ?? "")
  const directory = useDirectoryChooser(setWorkingDirectoryOverride)
  const { data: projectGroups, error: projectsError } = useQuery(client.query.projects.list.queryOptions())
  const selectedProject = projectGroups?.projects.find((project) => project.id === projectId)
  const { mutate, isPending, error } = useMutation(client.query.bots.updateWorkspace.mutationOptions({
    onSuccess(updated) {
      queryClient.invalidateQueries({ queryKey: client.query.bots.get.queryOptions({ input: { id: updated.id } }).queryKey })
      queryClient.invalidateQueries({ queryKey: client.query.projects.list.queryOptions().queryKey })
      onClose()
    },
  }))
  const failure = directory.error ?? projectsError?.message ?? error?.message

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
          <Field label="Projeto"><select className={fieldControlClassName} value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">Sem projeto</option>{projectGroups?.projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select></Field>
          <Field label="Pasta própria" optional as="div">
            <DirectoryPicker value={workingDirectoryOverride} placeholder="Usar outra pasta" onChoose={directory.choose} onClear={() => setWorkingDirectoryOverride("")} />
            <WorkspaceHint source={selectedProject && { name: selectedProject.name, directory: selectedProject.defaultWorkingDirectory }} workingDirectoryOverride={workingDirectoryOverride} />
          </Field>
          <div className="flex min-w-0 flex-col gap-1.25 border-t border-outline pt-4"><span className="text-metadata font-semibold tracking-[0.08em] text-muted uppercase">Pasta efetiva atual</span><strong className="font-mono text-support font-medium text-secondary [overflow-wrap:anywhere]">{bot.effectiveWorkingDirectory}</strong></div>
          {failure && <p className="text-support text-status-error">Falha ao alterar o Projeto: {failure}</p>}
          <Button type="button" disabled={isPending} onClick={() => mutate({ id: bot.id, projectId: projectId || null, workingDirectoryOverride: workingDirectoryOverride || null })}>{isPending ? "Salvando..." : "Salvar alterações"}</Button>
        </section>
      </aside>
    </div>
  )
}
