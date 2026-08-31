import { Blobatar } from "@blobatar/react"
import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useSelector } from "@tanstack/react-store"
import { type ChangeEvent, type FormEvent, useState } from "react"
import type { EngineClient } from "../engine-client"
import { botsStore, closeCreateBot, openCreateBot, selectBot } from "./bots-store"
import { formatProvider } from "./provider-name"

export function BotsWorkspace({ client }: { client: EngineClient }) {
  const isCreateOpen = useSelector(botsStore, (state) => state.isCreateOpen)
  const selectedBotId = useSelector(botsStore, (state) => state.selectedBotId)

  return (
    <section className="bots-workspace" aria-label="Bots">
      <BotsSidebar client={client} />
      <div className="bot-content">
        {isCreateOpen ? <CreateBotForm client={client} /> : <BotSummary key={selectedBotId ?? "no-bot"} client={client} botId={selectedBotId} />}
      </div>
    </section>
  )
}

function BotsSidebar({ client }: { client: EngineClient }) {
  const selectedBotId = useSelector(botsStore, (state) => state.selectedBotId)
  const { data, error, isPending } = useQuery(client.bots.list.queryOptions())

  return (
    <aside className="bots-sidebar">
      <div className="bots-sidebar-heading">
        <h2>Bots</h2>
        <button className="secondary-button" type="button" onClick={openCreateBot}>Novo Bot</button>
      </div>
      {error && <p className="error">Falha ao carregar Bots: {error.message}</p>}
      {isPending && <p className="empty">Carregando Bots...</p>}
      {data?.length === 0 && <div className="bots-empty"><strong>Nenhum Bot</strong><span>Crie o primeiro para começar.</span></div>}
      <ul className="bots-list">
        {data?.map((bot) => (
          <li key={bot.id}>
            <button
              className={selectedBotId === bot.id ? "bot-list-button selected" : "bot-list-button"}
              type="button"
              onClick={() => selectBot(bot.id)}
            >
              <Blobatar className="bot-avatar" name={`jots:${bot.id}:${bot.name}`} size={32} alt="" />
              <span><strong>{bot.name}</strong><small>{formatProvider(bot.provider)}</small></span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  )
}

function BotSummary({ client, botId }: { client: EngineClient; botId: string | null }) {
  const { data, error, isFetching } = useQuery(client.bots.get.queryOptions({
    input: botId ? { id: botId } : skipToken,
  }))

  if (!botId) {
    return <div className="bot-placeholder"><strong>Escolha um Bot</strong><p>Abra um Bot da lista ou crie um novo.</p></div>
  }

  if (error) {
    return <p className="error">Falha ao abrir o Bot: {error.message}</p>
  }

  if (isFetching || !data) {
    return <p className="empty">Abrindo Bot...</p>
  }

  return (
    <article className="bot-summary">
      <div className="bot-summary-heading">
        <div><p className="eyebrow">Bot</p><h2>{data.name}</h2></div>
        <span className="provider-chip">{formatProvider(data.provider)}</span>
      </div>
      <section className="leader-card">
        <p className="eyebrow">Função</p>
        <dl className="leader-function">
          <div><dt>Resultado</dt><dd>{data.function.outcome}</dd></div>
          <div><dt>Responsabilidades</dt><dd>{data.function.responsibilities}</dd></div>
          <div><dt>Limites</dt><dd>{data.function.limits}</dd></div>
          <div><dt>Entrega</dt><dd>{data.function.delivery}</dd></div>
        </dl>
      </section>
    </article>
  )
}

function CreateBotForm({ client }: { client: EngineClient }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState("")
  const [provider, setProvider] = useState<"codex" | "claude" | "">("")
  const [outcome, setOutcome] = useState("")
  const [responsibilities, setResponsibilities] = useState("")
  const [limits, setLimits] = useState("")
  const [delivery, setDelivery] = useState("")
  const { data: providers, error: providersError, isPending: providersPending } = useQuery(client.providers.list.queryOptions())
  const availableProviders = providers?.filter((candidate) => candidate.status === "available") ?? []
  const { mutate, isPending, error } = useMutation(client.bots.create.mutationOptions({
    onSuccess(bot) {
      queryClient.invalidateQueries({ queryKey: client.bots.list.queryOptions().queryKey })
      selectBot(bot.id)
    },
  }))

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!provider) {
      return
    }

    mutate({ name, provider, function: { outcome, responsibilities, limits, delivery } })
  }

  function handleProviderChange(event: ChangeEvent<HTMLSelectElement>) {
    const value = event.target.value

    if (value === "" || value === "codex" || value === "claude") {
      setProvider(value)
    }
  }

  return (
    <form className="bot-form" onSubmit={handleSubmit}>
      <div className="bot-form-heading">
        <div><p className="eyebrow">Novo Bot</p><h2>Defina o trabalho do Bot</h2></div>
        <button className="text-button" type="button" onClick={closeCreateBot}>Cancelar</button>
      </div>
      <div className="form-grid">
        <label>Nome<input autoFocus required value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>Executor
          <select required value={provider} onChange={handleProviderChange}>
            <option value="">Escolha uma sessão</option>
            {availableProviders.map((candidate) => <option key={candidate.provider} value={candidate.provider}>{formatProvider(candidate.provider)}</option>)}
          </select>
        </label>
      </div>
      <fieldset>
        <legend>Função</legend>
        <label>Resultado esperado<textarea required rows={2} value={outcome} onChange={(event) => setOutcome(event.target.value)} /></label>
        <label>Responsabilidades<textarea required rows={3} value={responsibilities} onChange={(event) => setResponsibilities(event.target.value)} /></label>
        <label>Limites<textarea required rows={3} value={limits} onChange={(event) => setLimits(event.target.value)} /></label>
        <label>Forma de entrega<textarea required rows={2} value={delivery} onChange={(event) => setDelivery(event.target.value)} /></label>
      </fieldset>
      {providersPending && <p className="empty">Verificando executores...</p>}
      {!providersPending && availableProviders.length === 0 && <p className="form-notice">Entre no Codex ou Claude Code para criar um Bot.</p>}
      {providersError && <p className="error">Falha ao verificar executores: {providersError.message}</p>}
      {error && <p className="error">Falha ao criar o Bot: {error.message}</p>}
      <div className="form-actions">
        <button className="secondary-button" type="button" onClick={closeCreateBot}>Cancelar</button>
        <button type="submit" disabled={isPending || availableProviders.length === 0}>{isPending ? "Criando..." : "Criar Bot"}</button>
      </div>
    </form>
  )
}
