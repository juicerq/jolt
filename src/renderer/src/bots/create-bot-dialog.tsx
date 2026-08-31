import { FolderIcon, XMarkIcon } from "@heroicons/react/24/outline"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { type FormEvent, useState } from "react"
import type { EngineClient } from "../engine-client"
import { closeDialog, selectBot } from "./bots-store"

export function CreateBotDialog({ client }: { client: EngineClient }) {
  return (
    <div className="prototype-overlay create-bot-overlay" role="presentation" onKeyDown={(event) => event.key === "Escape" && closeDialog()} onMouseDown={(event) => event.target === event.currentTarget && closeDialog()}>
      <dialog className="create-bot-dialog" aria-labelledby="create-bot-title" open><CreateBotForm client={client} /></dialog>
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
    <form className="bot-form" onSubmit={handleSubmit}>
      <div className="bot-form-heading">
        <div><p className="eyebrow">Novo Bot · {step} de 2</p><h2 id="create-bot-title">{step === 1 ? "Quem vai trabalhar?" : "Qual é o trabalho?"}</h2></div>
        <button className="dialog-close-button" type="button" aria-label="Fechar" onClick={closeDialog}><XMarkIcon aria-hidden="true" /></button>
      </div>
      <div className="create-bot-progress" aria-hidden="true"><span className={step === 2 ? "complete" : ""} /></div>
      <div className="create-bot-body">
        {step === 1 ? (
          <>
            <label>Nome<input autoFocus required placeholder="Ex: Revisor de código" value={name} onChange={(event) => setName(event.target.value)} /></label>
            <div className="provider-field"><span>Executor</span><div className="provider-options">{availableProviders.length > 0 && <div className="provider-option selected"><strong>Pi · Codex</strong><small>Sessão disponível</small></div>}</div></div>
            <label><span className="field-label">Projeto <small>Opcional</small></span>
              <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
                <option value="">Sem projeto</option>
                {projectGroups?.projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}
              </select>
            </label>
            <div className="project-directory-field bot-directory-field">
              <span>Pasta própria <small>Opcional</small></span>
              <button className="directory-picker" type="button" onClick={handleChooseDirectory}><FolderIcon aria-hidden="true" /><span>{workingDirectoryOverride || "Usar outra pasta"}</span></button>
              <BotDirectoryHelp project={selectedProject} workingDirectoryOverride={workingDirectoryOverride} />
              {workingDirectoryOverride && <button className="text-button directory-reset" type="button" onClick={() => setWorkingDirectoryOverride("")}>Remover pasta própria</button>}
            </div>
            {directoryError && <p className="error">Falha ao escolher a pasta: {directoryError}</p>}
            {providersPending && <p className="empty">Verificando executores...</p>}
            {!providersPending && availableProviders.length === 0 && <p className="form-notice">Entre no Pi com sua assinatura do Codex para criar um Bot.</p>}
            {providersError && <p className="error">Falha ao verificar executores: {providersError.message}</p>}
          </>
        ) : (
          <div className="function-fields">
            <label>Resultado esperado<textarea autoFocus required rows={3} placeholder="O que este Bot deve alcançar?" value={outcome} onChange={(event) => setOutcome(event.target.value)} /></label>
            <label>Responsabilidades<textarea required rows={3} placeholder="O que fica por conta dele?" value={responsibilities} onChange={(event) => setResponsibilities(event.target.value)} /></label>
            <label>Limites<textarea required rows={3} placeholder="O que ele não deve fazer?" value={limits} onChange={(event) => setLimits(event.target.value)} /></label>
            <label>Forma de entrega<textarea required rows={3} placeholder="Como deve apresentar o resultado?" value={delivery} onChange={(event) => setDelivery(event.target.value)} /></label>
          </div>
        )}
        {error && <p className="error">Falha ao criar o Bot: {error.message}</p>}
      </div>
      <div className="form-actions create-bot-actions">
        <button className="text-button" type="button" onClick={step === 1 ? closeDialog : () => setStep(1)}>{secondaryActionLabel}</button>
        <button type="submit" disabled={isPending || availableProviders.length === 0}>{primaryActionLabel}</button>
      </div>
    </form>
  )
}

function BotDirectoryHelp({ project, workingDirectoryOverride }: { project?: { name: string; defaultWorkingDirectory: string }; workingDirectoryOverride: string }) {
  if (workingDirectoryOverride) {
    return <small>Este Bot usará a pasta própria no lugar da pasta do Projeto.</small>
  }

  if (project) {
    return <small>Herdada de {project.name}: <span className="directory-path">{project.defaultWorkingDirectory}</span></small>
  }

  return <small>O Jots criará uma pasta privada para este Bot.</small>
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
