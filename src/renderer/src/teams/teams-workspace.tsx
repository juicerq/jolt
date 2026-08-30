import { useSelector } from "@tanstack/react-store"
import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { type ChangeEvent, type FormEvent, useState } from "react"
import type { ProviderAvailability } from "../../../shared/providers"
import type { EngineClient } from "../engine-client"
import { closeCreateTeam, openCreateTeam, selectTeam, teamsStore } from "./teams-store"

export function TeamsWorkspace({ client }: { client: EngineClient }) {
  const isCreateOpen = useSelector(teamsStore, (state) => state.isCreateOpen)
  const selectedTeamId = useSelector(teamsStore, (state) => state.selectedTeamId)

  return (
    <section className="teams-workspace" aria-label="Times">
      <TeamsSidebar client={client} />
      <div className="team-content">
        {isCreateOpen ? <CreateTeamForm client={client} /> : <TeamSummary client={client} teamId={selectedTeamId} />}
      </div>
    </section>
  )
}

function TeamsSidebar({ client }: { client: EngineClient }) {
  const selectedTeamId = useSelector(teamsStore, (state) => state.selectedTeamId)
  const { data, error, isPending } = useQuery(client.teams.list.queryOptions())

  return (
    <aside className="teams-sidebar">
      <div className="teams-sidebar-heading">
        <h2>Times</h2>
        <button className="secondary-button" type="button" onClick={openCreateTeam}>Novo Time</button>
      </div>
      {error && <p className="error">Falha ao carregar Times: {error.message}</p>}
      {isPending && <p className="empty">Carregando Times...</p>}
      {data?.length === 0 && <div className="teams-empty"><strong>Nenhum Time</strong><span>Crie o primeiro para começar.</span></div>}
      <ul className="teams-list">
        {data?.map((team) => (
          <li key={team.id}>
            <button
              className={selectedTeamId === team.id ? "team-list-button selected" : "team-list-button"}
              type="button"
              onClick={() => selectTeam(team.id)}
            >
              <strong>{team.name}</strong>
              <span>{team.objective}</span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  )
}

function TeamSummary({ client, teamId }: { client: EngineClient; teamId: string | null }) {
  const { data, error, isFetching } = useQuery(client.teams.get.queryOptions({
    input: teamId ? { id: teamId } : skipToken,
  }))

  if (!teamId) {
    return (
      <div className="team-placeholder">
        <strong>Escolha um Time</strong>
        <p>Abra um Time da lista ou crie um novo.</p>
      </div>
    )
  }

  if (error) {
    return <p className="error">Falha ao abrir o Time: {error.message}</p>
  }

  if (isFetching || !data) {
    return <p className="empty">Abrindo Time...</p>
  }

  return (
    <article className="team-summary">
      <div className="team-summary-heading">
        <div><p className="eyebrow">Time</p><h2>{data.name}</h2></div>
        <span className="provider-chip">{formatProvider(data.leader.provider)}</span>
      </div>
      <p className="team-goal">{data.objective}</p>
      <section className="leader-card">
        <p className="eyebrow">Líder</p>
        <h3>{data.leader.name}</h3>
        <dl className="leader-function">
          <div><dt>Resultado</dt><dd>{data.leader.function.outcome}</dd></div>
          <div><dt>Responsabilidades</dt><dd>{data.leader.function.responsibilities}</dd></div>
          <div><dt>Limites</dt><dd>{data.leader.function.limits}</dd></div>
          <div><dt>Entrega</dt><dd>{data.leader.function.delivery}</dd></div>
        </dl>
      </section>
    </article>
  )
}

function CreateTeamForm({ client }: { client: EngineClient }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState("")
  const [objective, setObjective] = useState("")
  const [defaultProvider, setDefaultProvider] = useState<"codex" | "claude" | "">("")
  const [leaderName, setLeaderName] = useState("")
  const [outcome, setOutcome] = useState("")
  const [responsibilities, setResponsibilities] = useState("")
  const [limits, setLimits] = useState("")
  const [delivery, setDelivery] = useState("")
  const { data: providers, error: providersError, isPending: providersPending } = useQuery(client.providers.list.queryOptions())
  const availableProviders = providers?.filter((provider) => provider.status === "available") ?? []
  const { mutate, isPending, error } = useMutation(client.teams.create.mutationOptions({
    onSuccess(team) {
      queryClient.invalidateQueries({ queryKey: client.teams.list.queryOptions().queryKey })
      selectTeam(team.id)
    },
  }))

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!defaultProvider) {
      return
    }

    mutate({
      name,
      objective,
      defaultProvider,
      leader: {
        name: leaderName,
        function: { outcome, responsibilities, limits, delivery },
      },
    })
  }

  function handleProviderChange(event: ChangeEvent<HTMLSelectElement>) {
    const provider = event.target.value

    if (provider === "" || provider === "codex" || provider === "claude") {
      setDefaultProvider(provider)
    }
  }

  return (
    <form className="team-form" onSubmit={handleSubmit}>
      <div className="team-form-heading">
        <div><p className="eyebrow">Novo Time</p><h2>Defina o trabalho do Time</h2></div>
        <button className="text-button" type="button" onClick={closeCreateTeam}>Cancelar</button>
      </div>
      <div className="form-grid">
        <label>Nome<input autoFocus required value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>Fornecedor
          <select required value={defaultProvider} onChange={handleProviderChange}>
            <option value="">Escolha uma sessão</option>
            {availableProviders.map((provider) => <option key={provider.provider} value={provider.provider}>{formatProvider(provider.provider)}</option>)}
          </select>
        </label>
      </div>
      <label>Objetivo<textarea required rows={2} value={objective} onChange={(event) => setObjective(event.target.value)} /></label>
      <fieldset>
        <legend>Função do Líder</legend>
        <label>Nome do Líder<input required value={leaderName} onChange={(event) => setLeaderName(event.target.value)} /></label>
        <label>Resultado esperado<textarea required rows={2} value={outcome} onChange={(event) => setOutcome(event.target.value)} /></label>
        <label>Responsabilidades<textarea required rows={3} value={responsibilities} onChange={(event) => setResponsibilities(event.target.value)} /></label>
        <label>Limites<textarea required rows={3} value={limits} onChange={(event) => setLimits(event.target.value)} /></label>
        <label>Forma de entrega<textarea required rows={2} value={delivery} onChange={(event) => setDelivery(event.target.value)} /></label>
      </fieldset>
      {providersPending && <p className="empty">Verificando fornecedores...</p>}
      {!providersPending && availableProviders.length === 0 && <p className="form-notice">Entre no Codex ou Claude Code para criar um Time.</p>}
      {providersError && <p className="error">Falha ao verificar fornecedores: {providersError.message}</p>}
      {error && <p className="error">Falha ao criar o Time: {error.message}</p>}
      <div className="form-actions">
        <button className="secondary-button" type="button" onClick={closeCreateTeam}>Cancelar</button>
        <button type="submit" disabled={isPending || availableProviders.length === 0}>{isPending ? "Criando..." : "Criar Time"}</button>
      </div>
    </form>
  )
}

function formatProvider(provider: ProviderAvailability["provider"]) {
  return provider === "codex" ? "Codex" : "Claude Code"
}
