import { Blobatar } from "@blobatar/react"
import { ChevronDownIcon, FolderIcon, XMarkIcon } from "@heroicons/react/24/outline"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { type FormEvent, type KeyboardEvent, useEffect, useState } from "react"
import type { EngineClient } from "../engine-client"
import { Button } from "../ui/button"
import { useDirectoryChooser } from "../ui/directory-picker"
import { IconButton } from "../ui/icon-button"
import { workspaceInput } from "./bot-workspace"
import { discardDraft, selectBot } from "./bots-store"

const chipClassName = "flex h-9 w-full cursor-pointer items-center gap-2 rounded-lg border border-outline-strong bg-transparent px-3 text-left text-support font-medium text-secondary hover:bg-surface-hover hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
const lineClassName = "w-full border-0 bg-transparent text-center text-primary placeholder:text-muted focus-visible:outline-none"
const revealClassName = "transition-[opacity,transform] duration-180 ease-out starting:translate-y-1 starting:opacity-0 motion-reduce:transition-none"

function focusNext(event: KeyboardEvent<HTMLInputElement | HTMLSelectElement>) {
  if (event.key !== "Enter" || event.nativeEvent.isComposing) {
    return
  }

  event.preventDefault()
  const controls = Array.from(event.currentTarget.form?.querySelectorAll<HTMLElement>("input, select, button[type=button]:not([aria-label]), button[type=submit]") ?? [])
  controls[controls.indexOf(event.currentTarget) + 1]?.focus()
}

export function NewBot({ client }: { client: EngineClient }) {
  const queryClient = useQueryClient()
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
  const named = name.trim() !== ""
  const described = named && outcome.trim() !== ""
  const { mutate, isPending, error } = useMutation(client.query.bots.create.mutationOptions({
    onSuccess(bot) {
      queryClient.invalidateQueries({ queryKey: client.query.projects.list.queryOptions().queryKey })
      queryClient.invalidateQueries({ queryKey: client.query.bots.list.queryOptions().queryKey })
      selectBot(bot.id)
    },
  }))

  useEffect(() => {
    function handleKey(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        discardDraft()
      }
    }

    window.addEventListener("keydown", handleKey)

    return () => window.removeEventListener("keydown", handleKey)
  }, [])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    mutate({
      name: name.trim(),
      provider: "codex",
      function: { outcome: outcome.trim() },
      ...workspaceInput(workspace),
      ...(workingDirectoryOverride ? { workingDirectoryOverride } : {}),
    })
  }

  return (
    <section className="relative grid h-full min-h-0 overflow-y-auto bg-surface" aria-label="Novo Bot">
      <IconButton className="top-2.5 right-[var(--window-controls-clearance)] z-2" iconSize={16} position="absolute" type="button" label="Descartar" tooltipPlacement="left" onClick={discardDraft}><XMarkIcon aria-hidden="true" /></IconButton>
      <form className="mx-auto mt-[26vh] mb-auto flex w-[min(520px,calc(100%-48px))] flex-col items-center gap-2 pb-12 text-center" onSubmit={handleSubmit}>
        <Blobatar className="size-16 flex-none rounded-[18px] border border-outline-strong bg-surface-raised" name={`jolt:new:${name}`} size={64} alt="" />
        <label className="sr-only" htmlFor="new-bot-name">Nome</label>
        <input className={`${lineClassName} mt-4 text-title font-semibold`} id="new-bot-name" autoFocus required autoComplete="off" placeholder="Nome do Bot" value={name} onChange={(event) => setName(event.target.value)} onKeyDown={focusNext} />
        {named && (
          <>
            <label className="sr-only" htmlFor="new-bot-outcome">Resultado esperado</label>
            <input className={`${lineClassName} ${revealClassName} text-support text-secondary`} id="new-bot-outcome" required autoComplete="off" placeholder="O que ele entrega?" value={outcome} onChange={(event) => setOutcome(event.target.value)} onKeyDown={focusNext} />
          </>
        )}
        {described && (
          <div className={`${revealClassName} mt-6 flex w-[280px] flex-col gap-2`}>
            {hasWorkspaceOptions && (
              <label className="relative">
                <span className="sr-only">Vínculo</span>
                <select className={`${chipClassName} appearance-none pr-8`} value={workspace} onChange={(event) => setWorkspace(event.target.value)} onKeyDown={focusNext}>
                  <option value="">Bot independente</option>
                  {projects.length > 0 && <optgroup label="Projetos">{projects.map((candidate) => <option value={`project:${candidate.id}`} key={candidate.id}>{candidate.name}</option>)}</optgroup>}
                  {leaders.length > 0 && <optgroup label="Líderes">{leaders.map((candidate) => <option value={`leader:${candidate.id}`} key={candidate.id}>{candidate.name}</option>)}</optgroup>}
                </select>
                <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-muted" aria-hidden="true" />
              </label>
            )}
            {workingDirectoryOverride
              ? <span className={`${chipClassName} cursor-default pr-1.5 text-primary`}><FolderIcon className="size-4 shrink-0" aria-hidden="true" /><span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap" title={workingDirectoryOverride}>{workingDirectoryOverride.split("/").filter(Boolean).at(-1)}</span><IconButton iconSize={13} size={24} type="button" label="Remover pasta" onClick={() => setWorkingDirectoryOverride("")}><XMarkIcon aria-hidden="true" /></IconButton></span>
              : <button className={chipClassName} type="button" onClick={directory.choose}><FolderIcon className="size-4 shrink-0" aria-hidden="true" />Pasta</button>}
            <Button className="mt-4" type="submit" disabled={isPending || !executorAvailable}>{isPending ? "Criando..." : "Criar Bot"}</Button>
          </div>
        )}
        {directory.error && <p className="m-0 text-support text-status-error">Falha ao escolher a pasta: {directory.error}</p>}
        {providersError && <p className="m-0 text-support text-status-error">Falha ao verificar executores: {providersError.message}</p>}
        {!providersPending && !providersError && !executorAvailable && <p className="m-0 text-support text-status-warning">Entre no Pi com sua assinatura do Codex para criar um Bot.</p>}
        {error && <p className="m-0 text-support text-status-error">Falha ao criar o Bot: {error.message}</p>}
      </form>
    </section>
  )
}
