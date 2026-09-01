import { Blobatar } from "@blobatar/react"
import { ChevronDownIcon, FolderIcon, LinkIcon, XMarkIcon } from "@heroicons/react/24/outline"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { type FormEvent, type KeyboardEvent, useEffect, useState } from "react"
import type { EngineClient } from "../engine-client"
import { Button } from "../ui/button"
import { useDirectoryChooser } from "../ui/directory-picker"
import { fieldControlClassName } from "../ui/field"
import { IconButton } from "../ui/icon-button"
import { workspaceInput } from "./bot-workspace"
import { discardDraft, nameDraft, selectBot } from "./bots-store"

type Step = "name" | "outcome" | "workspace"

const chipClassName = `${fieldControlClassName} flex cursor-pointer items-center gap-2 text-left hover:border-focus`
const lineClassName = "w-full border-0 bg-transparent text-center text-primary placeholder:text-muted focus-visible:outline-none"
const revealClassName = "transition-[opacity,transform] duration-180 ease-out starting:translate-y-1 starting:opacity-0 motion-reduce:transition-none"
const hintClassName = `${revealClassName} text-metadata font-medium text-muted`
const settledClassName = `${revealClassName} cursor-text rounded-md border-0 bg-transparent px-2 py-0 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring active:bg-surface-active`

function onEnter(commit: () => void) {
  return (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) {
      return
    }

    event.preventDefault()
    const filled = event.currentTarget.value.trim() !== ""

    if (filled) {
      commit()
    }
  }
}

export function NewBot({ client }: { client: EngineClient }) {
  const queryClient = useQueryClient()
  const [step, setStep] = useState<Step>("name")
  const [name, setName] = useState("")
  const [outcome, setOutcome] = useState("")
  const [workspace, setWorkspace] = useState("")
  const [workingDirectoryOverride, setWorkingDirectoryOverride] = useState("")
  const directory = useDirectoryChooser(setWorkingDirectoryOverride)
  const { data: providers, error: providersError, isPending: providersPending } = useQuery(client.query.providers.list.queryOptions())
  const { data: projectGroups } = useQuery(client.query.projects.list.queryOptions())
  const executorAvailable = providers?.some((candidate) => candidate.status === "available") ?? false
  const projects = projectGroups?.projects ?? []
  const leaders = [...projects.flatMap((project) => project.bots), ...(projectGroups?.unassignedBots ?? [])]
  const hasWorkspaceOptions = projects.length > 0 || leaders.length > 0
  const { mutate, isPending, error } = useMutation(client.query.bots.create.mutationOptions({
    onSuccess(bot) {
      queryClient.invalidateQueries({ queryKey: client.query.projects.list.queryOptions().queryKey })
      queryClient.invalidateQueries({ queryKey: client.query.bots.list.queryOptions().queryKey })
      selectBot(bot.id)
    },
  }))

  useEffect(() => {
    function handleKey(event: globalThis.KeyboardEvent) {
      const inSelect = event.target instanceof HTMLSelectElement

      if (event.key === "Escape" && !inSelect) {
        discardDraft()
      }
    }

    window.addEventListener("keydown", handleKey)

    return () => window.removeEventListener("keydown", handleKey)
  }, [])

  function commitName() {
    const trimmed = name.trim()
    setName(trimmed)
    nameDraft(trimmed)
    setStep("outcome")
  }

  function commitOutcome() {
    setOutcome(outcome.trim())
    setStep("workspace")
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    mutate({
      name,
      provider: "codex",
      function: { outcome },
      ...workspaceInput(workspace),
      ...(workingDirectoryOverride ? { workingDirectoryOverride } : {}),
    })
  }

  return (
    <section className="relative grid h-full min-h-0 overflow-y-auto bg-surface" aria-label="Novo Bot">
      <IconButton className="top-2.5 right-[var(--window-controls-clearance)] z-2" iconSize={16} position="absolute" type="button" label="Descartar" tooltipPlacement="left" onClick={discardDraft}><XMarkIcon aria-hidden="true" /></IconButton>
      <form className="mx-auto mt-[26vh] mb-auto flex w-[min(520px,calc(100%-48px))] flex-col items-center gap-2 pb-12 text-center" onSubmit={handleSubmit}>
        <Blobatar className="size-16 flex-none rounded-[18px] border border-outline-strong bg-surface-raised" name={`jolt:new:${name}`} size={64} alt="" />
        {step === "name"
          ? (
            <>
              <label className="sr-only" htmlFor="new-bot-name">Nome</label>
              <input className={`${lineClassName} mt-4 mb-1.5 text-title font-semibold placeholder:font-normal`} id="new-bot-name" autoFocus autoComplete="off" placeholder="Nome do Bot" value={name} onChange={(event) => setName(event.target.value)} onKeyDown={onEnter(commitName)} />
              <small className={`${hintClassName} mt-2`}>Enter para continuar</small>
            </>
          )
          : <button className={`${settledClassName} mt-4 mb-1.5 text-title font-semibold text-primary`} type="button" title="Editar nome" onClick={() => setStep("name")}>{name}</button>}
        {step === "outcome" && (
          <>
            <label className="sr-only" htmlFor="new-bot-outcome">Resultado esperado</label>
            <input className={`${lineClassName} ${revealClassName} text-support text-secondary`} id="new-bot-outcome" autoFocus autoComplete="off" placeholder="O que ele entrega?" value={outcome} onChange={(event) => setOutcome(event.target.value)} onKeyDown={onEnter(commitOutcome)} />
            <small className={`${hintClassName} mt-2`}>Enter para continuar</small>
          </>
        )}
        {step === "workspace" && (
          <>
            <button className={`${settledClassName} text-support text-secondary`} type="button" title="Editar resultado" onClick={() => setStep("outcome")}>{outcome}</button>
            <div className={`${revealClassName} mt-6 flex w-[280px] flex-col gap-2`}>
              {hasWorkspaceOptions && (
                <label className="relative">
                  <span className="sr-only">Vínculo</span>
                  <LinkIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-secondary" aria-hidden="true" />
                  <select className={`${chipClassName} appearance-none pr-8 pl-9`} value={workspace} onChange={(event) => setWorkspace(event.target.value)}>
                    <option value="">Sem projeto</option>
                    {projects.length > 0 && <optgroup label="Projetos">{projects.map((candidate) => <option value={`project:${candidate.id}`} key={candidate.id}>{candidate.name}</option>)}</optgroup>}
                    {leaders.length > 0 && <optgroup label="Líderes">{leaders.map((candidate) => <option value={`leader:${candidate.id}`} key={candidate.id}>{candidate.name}</option>)}</optgroup>}
                  </select>
                  <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-secondary" aria-hidden="true" />
                </label>
              )}
              {workingDirectoryOverride
                ? <span className={`${chipClassName} cursor-default pr-1.5 hover:border-outline-strong`}><FolderIcon className="size-4 shrink-0 text-secondary" aria-hidden="true" /><span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap" title={workingDirectoryOverride}>{workingDirectoryOverride.split("/").filter(Boolean).at(-1)}</span><IconButton iconSize={13} size={24} type="button" label="Remover pasta" onClick={() => setWorkingDirectoryOverride("")}><XMarkIcon aria-hidden="true" /></IconButton></span>
                : <button className={chipClassName} type="button" onClick={directory.choose}><FolderIcon className="size-4 shrink-0 text-secondary" aria-hidden="true" /><span className="text-muted">Pasta</span></button>}
              <Button className="mt-4" type="submit" autoFocus disabled={isPending || !executorAvailable}>{isPending ? "Criando..." : "Criar Bot"}</Button>
            </div>
          </>
        )}
        {directory.error && <p className="m-0 text-support text-status-error">Falha ao escolher a pasta: {directory.error}</p>}
        {providersError && <p className="m-0 text-support text-status-error">Falha ao verificar executores: {providersError.message}</p>}
        {!providersPending && !providersError && !executorAvailable && <p className="m-0 text-support text-status-warning">Entre no Pi com sua assinatura do Codex para criar um Bot.</p>}
        {error && <p className="m-0 text-support text-status-error">Falha ao criar o Bot: {error.message}</p>}
      </form>
    </section>
  )
}
