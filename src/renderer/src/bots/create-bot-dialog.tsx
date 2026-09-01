import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { type FormEvent, useState } from "react"
import type { EngineClient } from "../engine-client"
import { Button } from "../ui/button"
import { Dialog, DialogActions, DialogBody } from "../ui/dialog"
import { DirectoryPicker, useDirectoryChooser } from "../ui/directory-picker"
import { Field, fieldControlClassName } from "../ui/field"
import { workspaceInput } from "./bot-workspace"
import { closeDialog, selectBot } from "./bots-store"
import { WorkspaceHint } from "./workspace-hint"

export function CreateBotDialog({ client }: { client: EngineClient }) {
  return (
    <Dialog eyebrow="Novo Bot" title="Quem vai trabalhar?" width={520} badge={<span className="rounded-full border border-outline-strong px-2.5 py-1.5 text-support font-semibold text-focus">Pi · Codex</span>} onClose={closeDialog}>
      <CreateBotForm client={client} />
    </Dialog>
  )
}

function CreateBotForm({ client }: { client: EngineClient }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState("")
  const [outcome, setOutcome] = useState("")
  const [description, setDescription] = useState("")
  const [workspace, setWorkspace] = useState("")
  const [workingDirectoryOverride, setWorkingDirectoryOverride] = useState("")
  const directory = useDirectoryChooser(setWorkingDirectoryOverride)
  const { data: providers, error: providersError, isPending: providersPending } = useQuery(client.query.providers.list.queryOptions())
  const { data: projectGroups } = useQuery(client.query.projects.list.queryOptions())
  const executorAvailable = providers?.some((candidate) => candidate.status === "available") ?? false
  const leaders = [...(projectGroups?.projects.flatMap((project) => project.bots) ?? []), ...(projectGroups?.unassignedBots ?? [])]
  const chosen = workspaceInput(workspace)
  const leader = "leaderBotId" in chosen ? leaders.find((candidate) => candidate.id === chosen.leaderBotId) : undefined
  const project = projectGroups?.projects.find((candidate) => candidate.id === ("projectId" in chosen ? chosen.projectId : leader?.projectId))
  const source = leader ? { name: leader.name, directory: leader.effectiveWorkingDirectory } : project && { name: project.name, directory: project.defaultWorkingDirectory }
  const { mutate, isPending, error } = useMutation(client.query.bots.create.mutationOptions({
    onSuccess(bot) {
      queryClient.invalidateQueries({ queryKey: client.query.projects.list.queryOptions().queryKey })
      queryClient.invalidateQueries({ queryKey: client.query.bots.list.queryOptions().queryKey })
      selectBot(bot.id)
    },
  }))

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    mutate({
      name: name.trim(),
      provider: "codex",
      function: { outcome: outcome.trim(), ...(description.trim() ? { description: description.trim() } : {}) },
      ...chosen,
      ...(workingDirectoryOverride ? { workingDirectoryOverride } : {}),
    })
  }

  return (
    <form className="flex min-h-0 flex-col" onSubmit={handleSubmit}>
      <DialogBody>
        <Field label="Nome"><input className={fieldControlClassName} autoFocus required placeholder="Ex: Revisor de código" value={name} onChange={(event) => setName(event.target.value)} /></Field>
        <Field label="Resultado esperado"><input className={fieldControlClassName} required placeholder="O que este Bot entrega?" value={outcome} onChange={(event) => setOutcome(event.target.value)} /></Field>
        <Field label="Descrição" optional><textarea className={`${fieldControlClassName} min-h-[88px] resize-none`} rows={3} placeholder="Responsabilidades, limites e forma de entrega" value={description} onChange={(event) => setDescription(event.target.value)} /></Field>
        <Field label="Vínculo" optional>
          <select className={fieldControlClassName} value={workspace} onChange={(event) => setWorkspace(event.target.value)}>
            <option value="">Bot independente</option>
            {!!projectGroups?.projects.length && <optgroup label="Projetos">{projectGroups.projects.map((candidate) => <option value={`project:${candidate.id}`} key={candidate.id}>{candidate.name}</option>)}</optgroup>}
            {leaders.length > 0 && <optgroup label="Líderes">{leaders.map((candidate) => <option value={`leader:${candidate.id}`} key={candidate.id}>{candidate.name}</option>)}</optgroup>}
          </select>
        </Field>
        <Field label="Pasta" optional as="div">
          <DirectoryPicker value={workingDirectoryOverride} placeholder="Escolher pasta" onChoose={directory.choose} onClear={() => setWorkingDirectoryOverride("")} />
          <WorkspaceHint source={source} workingDirectoryOverride={workingDirectoryOverride} />
        </Field>
        {directory.error && <p className="text-support text-status-error">Falha ao escolher a pasta: {directory.error}</p>}
        {providersError && <p className="text-support text-status-error">Falha ao verificar executores: {providersError.message}</p>}
        {!providersPending && !providersError && !executorAvailable && <p className="text-support text-status-warning">Entre no Pi com sua assinatura do Codex para criar um Bot.</p>}
        {error && <p className="text-support text-status-error">Falha ao criar o Bot: {error.message}</p>}
      </DialogBody>
      <DialogActions>
        <Button variant="text" type="button" onClick={closeDialog}>Cancelar</Button>
        <Button type="submit" disabled={isPending || !executorAvailable}>{isPending ? "Criando..." : "Criar Bot"}</Button>
      </DialogActions>
    </form>
  )
}
