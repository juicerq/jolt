import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { type ChangeEvent, type FormEvent, useState } from "react"
import type { EngineClient } from "../engine-client"
import { formatProvider } from "./provider-name"

export function CreateMemberForm({
  client,
  defaultProvider,
  onCancel,
  teamId,
}: {
  client: EngineClient
  defaultProvider: "codex" | "claude"
  onCancel: () => void
  teamId: string
}) {
  const queryClient = useQueryClient()
  const [name, setName] = useState("")
  const [provider, setProvider] = useState<"codex" | "claude" | "">("")
  const [outcome, setOutcome] = useState("")
  const [responsibilities, setResponsibilities] = useState("")
  const [limits, setLimits] = useState("")
  const [delivery, setDelivery] = useState("")
  const { data: providers, error: providersError, isPending: providersPending } = useQuery(client.providers.list.queryOptions())
  const availableProviders = providers?.filter((candidate) => candidate.status === "available") ?? []
  const defaultProviderAvailable = availableProviders.some((candidate) => candidate.provider === defaultProvider)
  const { mutate, isPending, error } = useMutation(client.teams.createMember.mutationOptions({
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: client.teams.get.queryOptions({ input: { id: teamId } }).queryKey })
      queryClient.invalidateQueries({ queryKey: client.teams.list.queryOptions().queryKey })
      onCancel()
    },
  }))

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!defaultProviderAvailable && !provider) {
      return
    }

    mutate({
      teamId,
      name,
      ...(provider ? { provider } : {}),
      function: { outcome, responsibilities, limits, delivery },
    })
  }

  function handleProviderChange(event: ChangeEvent<HTMLSelectElement>) {
    const selectedProvider = event.target.value

    if (selectedProvider === "" || selectedProvider === "codex" || selectedProvider === "claude") {
      setProvider(selectedProvider)
    }
  }

  return (
    <form className="team-form member-form" onSubmit={handleSubmit}>
      <div className="team-form-heading">
        <div><p className="eyebrow">Novo Integrante</p><h3>Defina a Função do Integrante</h3></div>
        <button className="text-button" type="button" onClick={onCancel}>Cancelar</button>
      </div>
      <div className="form-grid">
        <label>Nome<input autoFocus required value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>Fornecedor
          <select value={provider} onChange={handleProviderChange}>
            <option value="">Padrão do Time ({formatProvider(defaultProvider)})</option>
            {availableProviders.map((candidate) => (
              <option key={candidate.provider} value={candidate.provider}>{formatProvider(candidate.provider)}</option>
            ))}
          </select>
        </label>
      </div>
      {!providersPending && !defaultProviderAvailable && !provider && (
        <p className="form-notice">O fornecedor padrão não está disponível. Escolha uma sessão ativa.</p>
      )}
      <fieldset>
        <legend>Função</legend>
        <label>Resultado esperado<textarea required rows={2} value={outcome} onChange={(event) => setOutcome(event.target.value)} /></label>
        <label>Responsabilidades<textarea required rows={3} value={responsibilities} onChange={(event) => setResponsibilities(event.target.value)} /></label>
        <label>Limites<textarea required rows={3} value={limits} onChange={(event) => setLimits(event.target.value)} /></label>
        <label>Forma de entrega<textarea required rows={2} value={delivery} onChange={(event) => setDelivery(event.target.value)} /></label>
      </fieldset>
      {providersPending && <p className="empty">Verificando fornecedores...</p>}
      {providersError && <p className="error">Falha ao verificar fornecedores: {providersError.message}</p>}
      {error && <p className="error">Falha ao criar o Integrante: {error.message}</p>}
      <div className="form-actions">
        <button className="secondary-button" type="button" onClick={onCancel}>Cancelar</button>
        <button type="submit" disabled={isPending || providersPending || (!defaultProviderAvailable && !provider)}>
          {isPending ? "Criando..." : "Criar Integrante"}
        </button>
      </div>
    </form>
  )
}
