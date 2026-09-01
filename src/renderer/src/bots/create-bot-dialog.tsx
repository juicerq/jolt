import { FolderIcon, XMarkIcon } from "@heroicons/react/24/outline"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { type FormEvent, useState } from "react"
import type { EngineClient } from "../engine-client"
import { IconButton } from "../ui/icon-button"
import { closeDialog, selectBot } from "./bots-store"

const eyebrowClassName = "mb-[1em] text-metadata font-semibold tracking-[0.08em] text-muted uppercase"
const fieldLabelClassName = "flex flex-col gap-[7px] text-control font-semibold text-secondary"
const fieldControlClassName =
  "w-full rounded-lg border border-outline-strong bg-canvas px-3 py-2.5 text-control font-medium text-primary placeholder:text-muted focus-visible:border-focus focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
const textButtonClassName =
  "cursor-pointer rounded-lg bg-transparent px-0 py-2.5 text-control font-medium text-muted hover:bg-surface-hover hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring active:bg-surface-active"
const primaryButtonClassName =
  "cursor-pointer rounded-lg bg-accent px-3.5 py-2.5 text-control font-semibold text-accent-ink hover:bg-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring active:bg-focus disabled:cursor-default disabled:bg-surface-active disabled:text-muted disabled:opacity-100"

export function CreateBotDialog({ client }: { client: EngineClient }) {
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-overlay p-6 backdrop-blur-sm" role="presentation" onKeyDown={(event) => event.key === "Escape" && closeDialog()} onMouseDown={(event) => event.target === event.currentTarget && closeDialog()}>
      <dialog className="relative inset-auto m-auto box-border max-h-[calc(100vh-48px)] w-[min(680px,100%)] max-w-none overflow-hidden rounded-[18px] border border-outline-strong bg-surface-raised p-0 text-primary shadow-[0_2px_8px_rgb(0_0_0/45%),0_28px_90px_rgb(0_0_0/58%)]" aria-labelledby="create-bot-title" open><CreateBotForm client={client} /></dialog>
    </div>
  )
}

function CreateBotForm({ client }: { client: EngineClient }) {
  const queryClient = useQueryClient()
  const [step, setStep] = useState<1 | 2>(1)
  const [name, setName] = useState("")
  const [outcome, setOutcome] = useState("")
  const [responsibilities, setResponsibilities] = useState("")
  const [limits, setLimits] = useState("")
  const [delivery, setDelivery] = useState("")
  const [projectId, setProjectId] = useState("")
  const [workingDirectoryOverride, setWorkingDirectoryOverride] = useState("")
  const [directoryError, setDirectoryError] = useState<string>()
  const { data: providers, error: providersError, isPending: providersPending } = useQuery(client.query.providers.list.queryOptions())
  const { data: projectGroups } = useQuery(client.query.projects.list.queryOptions())
  const availableProviders = providers?.filter((candidate) => candidate.status === "available") ?? []
  const selectedProject = projectGroups?.projects.find((project) => project.id === projectId)
  const { mutate, isPending, error } = useMutation(client.query.bots.create.mutationOptions({
    onSuccess(bot) {
      queryClient.invalidateQueries({ queryKey: client.query.projects.list.queryOptions().queryKey })
      selectBot(bot.id)
    },
  }))
  const secondaryActionLabel = step === 1 ? "Cancelar" : "Voltar"
  const primaryActionLabel = getPrimaryActionLabel(step, isPending)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (step === 1) {
      if (availableProviders.length > 0) {
        setStep(2)
      }

      return
    }

    mutate({
      name: name.trim(),
      provider: "codex",
      function: { outcome, responsibilities, limits, delivery },
      ...(projectId ? { projectId } : {}),
      ...(workingDirectoryOverride ? { workingDirectoryOverride } : {}),
    })
  }

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
    <form className="flex max-h-[calc(100vh-48px)] flex-col overflow-y-auto" onSubmit={handleSubmit}>
      <div className="flex items-center justify-between gap-4 px-6 pt-6 pb-[18px]">
        <div><p className={eyebrowClassName}>Novo Bot · {step} de 2</p><h2 className="mt-[5px] text-title font-semibold tracking-[-0.02em] text-primary" id="create-bot-title">{step === 1 ? "Quem vai trabalhar?" : "Qual é o trabalho?"}</h2></div>
        <IconButton type="button" label="Fechar" tooltipPlacement="left" onClick={closeDialog}><XMarkIcon aria-hidden="true" /></IconButton>
      </div>
      <div className="h-0.5 bg-outline" aria-hidden="true"><span className={`block h-full w-1/2 origin-left bg-accent transition-transform duration-180 ease-out motion-reduce:transition-none${step === 2 ? " scale-x-200" : ""}`} /></div>
      <div className="flex min-h-[300px] flex-col gap-5 p-6 max-[720px]:min-h-0">
        {step === 1 ? (
          <>
            <label className={fieldLabelClassName}>Nome<input className={fieldControlClassName} autoFocus required placeholder="Ex: Revisor de código" value={name} onChange={(event) => setName(event.target.value)} /></label>
            <div className="flex flex-col gap-2 text-control font-semibold text-secondary"><span>Executor</span><div className="grid grid-cols-2 gap-2.5 max-[720px]:grid-cols-1">{availableProviders.length > 0 && <div className="flex flex-col items-start gap-0.5 rounded-[10px] border border-focus bg-surface-active px-3.5 py-3 text-left text-control font-medium text-secondary shadow-[inset_0_0_0_1px_var(--color-focus)]"><strong>Pi · Codex</strong><small className="text-metadata font-medium text-muted">Sessão disponível</small></div>}</div></div>
            <label className={fieldLabelClassName}><span className="flex items-baseline justify-between">Projeto <small className="text-metadata font-medium text-muted">Opcional</small></span>
              <select className={fieldControlClassName} value={projectId} onChange={(event) => setProjectId(event.target.value)}>
                <option value="">Sem projeto</option>
                {projectGroups?.projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}
              </select>
            </label>
            <div className="flex min-w-0 flex-col gap-2 rounded-xl border border-outline bg-surface p-4">
              <span className="flex items-baseline justify-between text-control font-semibold text-secondary">Pasta própria <small className="text-metadata font-medium text-muted">Opcional</small></span>
              <button className="flex w-full min-w-0 cursor-pointer items-center gap-2.5 rounded-lg border border-outline-strong bg-canvas px-3 py-[11px] text-left text-control font-medium text-secondary hover:border-focus hover:bg-surface-hover hover:text-primary focus-visible:border-focus focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring active:bg-surface-active [&_svg]:size-[17px] [&_svg]:shrink-0" type="button" onClick={handleChooseDirectory}><FolderIcon aria-hidden="true" /><span className="min-w-0 truncate">{workingDirectoryOverride || "Usar outra pasta"}</span></button>
              <BotDirectoryHelp project={selectedProject} workingDirectoryOverride={workingDirectoryOverride} />
              {workingDirectoryOverride && <button className={`${textButtonClassName} self-start px-2 py-1.5`} type="button" onClick={() => setWorkingDirectoryOverride("")}>Remover pasta própria</button>}
            </div>
            {directoryError && <p className="text-support text-status-error">Falha ao escolher a pasta: {directoryError}</p>}
            {providersPending && <p className="text-muted">Verificando executores...</p>}
            {!providersPending && availableProviders.length === 0 && <p className="rounded-lg border border-status-warning/45 bg-status-warning/10 p-3 text-support text-status-warning">Entre no Pi com sua assinatura do Codex para criar um Bot.</p>}
            {providersError && <p className="text-support text-status-error">Falha ao verificar executores: {providersError.message}</p>}
          </>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-[18px] max-[720px]:grid-cols-1">
            <label className={fieldLabelClassName}>Resultado esperado<textarea className={`${fieldControlClassName} min-h-[88px] resize-none`} autoFocus required rows={3} placeholder="O que este Bot deve alcançar?" value={outcome} onChange={(event) => setOutcome(event.target.value)} /></label>
            <label className={fieldLabelClassName}>Responsabilidades<textarea className={`${fieldControlClassName} min-h-[88px] resize-none`} required rows={3} placeholder="O que fica por conta dele?" value={responsibilities} onChange={(event) => setResponsibilities(event.target.value)} /></label>
            <label className={fieldLabelClassName}>Limites<textarea className={`${fieldControlClassName} min-h-[88px] resize-none`} required rows={3} placeholder="O que ele não deve fazer?" value={limits} onChange={(event) => setLimits(event.target.value)} /></label>
            <label className={fieldLabelClassName}>Forma de entrega<textarea className={`${fieldControlClassName} min-h-[88px] resize-none`} required rows={3} placeholder="Como deve apresentar o resultado?" value={delivery} onChange={(event) => setDelivery(event.target.value)} /></label>
          </div>
        )}
        {error && <p className="text-support text-status-error">Falha ao criar o Bot: {error.message}</p>}
      </div>
      <div className="flex items-center justify-end gap-4 border-t border-outline px-6 py-4">
        <button className={`${textButtonClassName} mr-auto`} type="button" onClick={step === 1 ? closeDialog : () => setStep(1)}>{secondaryActionLabel}</button>
        <button className={primaryButtonClassName} type="submit" disabled={isPending || availableProviders.length === 0}>{primaryActionLabel}</button>
      </div>
    </form>
  )
}

function BotDirectoryHelp({ project, workingDirectoryOverride }: { project?: { name: string; defaultWorkingDirectory: string }; workingDirectoryOverride: string }) {
  if (workingDirectoryOverride) {
    return <small className="text-support text-muted">Este Bot usará a pasta própria no lugar da pasta do Projeto.</small>
  }

  if (project) {
    return <small className="text-support text-muted">Herdada de {project.name}: <span className="font-mono [overflow-wrap:anywhere]">{project.defaultWorkingDirectory}</span></small>
  }

  return <small className="text-support text-muted">O Jolt criará uma pasta privada para este Bot.</small>
}

function getPrimaryActionLabel(step: 1 | 2, isPending: boolean) {
  if (step === 1) {
    return "Continuar"
  }

  if (isPending) {
    return "Criando..."
  }

  return "Criar Bot"
}
