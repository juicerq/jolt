import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { CurationModel } from "@src/shared/memory"
import type { EngineClient } from "../engine-client"
import { Button } from "../ui/button"
import { Field } from "../ui/field"
import { Select } from "../ui/select"
import { SettingsSection, settingsPanelClassName } from "../ui/settings-section"

function modelValue(model: CurationModel) {
  if (!model) {
    return ""
  }

  return JSON.stringify([model.provider, model.model])
}

export function MemorySettings({ client }: { client: EngineClient }) {
  const queryClient = useQueryClient()
  const options = client.query.memory.settings.queryOptions()
  const { data, error, isPending } = useQuery(options)
  const { mutate: configure, isPending: saving, error: saveError } = useMutation(client.query.memory.configure.mutationOptions({ onSuccess() {
    void queryClient.invalidateQueries({ queryKey: options.queryKey })
    void queryClient.invalidateQueries({ queryKey: client.query.memory.status.queryOptions().queryKey })
  } }))
  const choices = data?.providers.flatMap((catalog) => catalog.models.map((model) => ({ provider: catalog.provider, model: model.id }))) ?? []
  const unavailable = data?.model && !choices.some((choice) => modelValue(choice) === modelValue(data.model))
  const failure = error ?? saveError

  return (
    <SettingsSection title="Memória">
      <div className={`${settingsPanelClassName} flex flex-col gap-4`}>
        <Field label="Modelo da Curadoria">
          <Select value={modelValue(data?.model ?? null)} disabled={isPending || saving || !data} onChange={(event) => configure({ model: choices.find((choice) => modelValue(choice) === event.target.value) ?? null })}>
            <option value="">Usar o modelo de cada Bot</option>
            {unavailable && data.model && <option value={modelValue(data.model)} disabled>{data.model.model} · Indisponível</option>}
            {data?.providers.map((catalog) => <optgroup key={catalog.provider} label={catalog.name}>
              {catalog.models.map((model) => <option key={model.id} value={modelValue({ provider: catalog.provider, model: model.id })}>{model.name}</option>)}
            </optgroup>)}
          </Select>
        </Field>
        <p className="m-0 text-support text-secondary">Organiza as Lembranças de todos os Bots. As Notas, Lembranças e a Função de cada Bot são enviadas ao Fornecedor escolhido.</p>
        {isPending && <p className="m-0 text-support text-muted">Carregando modelos...</p>}
        {saving && <p className="m-0 text-support text-muted" role="status">Salvando...</p>}
        {unavailable && <p className="m-0 text-support text-status-error">O modelo escolhido está indisponível. Reconecte o Fornecedor ou escolha outro modelo. As Notas ficam pendentes.</p>}
        {failure && <p className="m-0 text-support text-status-error" role="alert">{failure.message}</p>}
        <CurationStatus client={client} />
      </div>
    </SettingsSection>
  )
}

function CurationStatus({ client }: { client: EngineClient }) {
  const queryClient = useQueryClient()
  const options = client.query.memory.status.queryOptions({ refetchInterval: 15_000 })
  const { data, error } = useQuery(options)
  const { mutate: retry, isPending, error: retryError } = useMutation(client.query.memory.retry.mutationOptions({ onSettled() {
    void queryClient.invalidateQueries({ queryKey: options.queryKey })
    void queryClient.invalidateQueries({ queryKey: client.query.memory.list.key() })
  } }))
  const failure = error ?? retryError

  return (
    <div className="flex flex-col gap-3" aria-live="polite">
      {data && <p className="m-0 text-support text-muted">{data.pending ? `${data.pending} ${data.pending === 1 ? "Nota aguardando" : "Notas aguardando"} Curadoria.` : "Nenhuma Nota pendente."}</p>}
      {data?.failures.map((entry) => <div key={entry.botId} className="flex flex-col items-start gap-2">
        <p className="m-0 text-support text-status-error">{entry.name}: {entry.error}</p>
        <Button type="button" variant="secondary" disabled={isPending} onClick={() => retry({ botId: entry.botId })}>{isPending ? "Avaliando..." : `Tentar novamente para ${entry.name}`}</Button>
      </div>)}
      {failure && <p className="m-0 text-support text-status-error" role="alert">{failure.message}</p>}
    </div>
  )
}
