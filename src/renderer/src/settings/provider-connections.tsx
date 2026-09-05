import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { type FormEvent, useState } from "react"
import type { ProviderAvailability } from "@src/shared/providers"
import type { EngineClient } from "../engine-client"
import { Button } from "../ui/button"
import { Dialog, DialogActions, DialogBody } from "../ui/dialog"
import { Field, fieldControlClassName } from "../ui/field"
import { SettingsSection, settingsPanelClassName } from "../ui/settings-section"

const statusDotClassNames = {
  available: "bg-status-success",
  unauthenticated: "bg-muted",
  incompatible: "bg-status-error",
}

const statusLabels = {
  available: "Conectado",
  unauthenticated: "Não conectado",
  incompatible: "Indisponível",
}

function describeProvider(provider: ProviderAvailability) {
  if (provider.status === "incompatible") {
    return "O Pi não respondeu sobre este Fornecedor"
  }

  if (provider.status === "available") {
    if (provider.connection === "subscription") {
      return "Conectado pela sua assinatura"
    }

    return "Conectado com uma chave de API"
  }

  if (provider.connection === "subscription") {
    return "Entre pelo pi no terminal para usar sua assinatura"
  }

  if (!provider.detectedKey) {
    return "Não conectado"
  }

  return "Achamos uma chave neste computador"
}

export function ProviderConnections({ client }: { client: EngineClient }) {
  const { data, error, isPending } = useQuery(client.query.providers.list.queryOptions())

  return (
    <SettingsSection title="Fornecedores">
      {error && <p className="m-0 text-support text-status-error">Falha ao verificar Fornecedores: {error.message}</p>}
      {isPending && <p className="m-0 text-support text-muted">Verificando Fornecedores...</p>}
      {data && (
        <div className={settingsPanelClassName}>
          <ul className="m-0 flex list-none flex-col divide-y divide-outline p-0">
            {data.map((provider) => <ProviderConnectionRow key={provider.provider} provider={provider} client={client} />)}
          </ul>
        </div>
      )}
    </SettingsSection>
  )
}

function ProviderConnectionRow({ provider, client }: { provider: ProviderAvailability; client: EngineClient }) {
  const queryClient = useQueryClient()
  const [pasting, setPasting] = useState(false)
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: client.query.providers.list.queryOptions().queryKey })
    void queryClient.invalidateQueries({ queryKey: client.query.providers.models.queryOptions().queryKey })
    void queryClient.invalidateQueries({ queryKey: client.query.memory.settings.queryOptions().queryKey })
  }
  const { mutate: connect, isPending: connecting, error: connectError } = useMutation(client.query.providers.connect.mutationOptions({ onSuccess: refresh }))
  const { mutate: disconnect, isPending: disconnecting, error: disconnectError } = useMutation(client.query.providers.disconnect.mutationOptions({ onSuccess: refresh }))
  const busy = connecting || disconnecting
  const failure = connectError?.message ?? disconnectError?.message
  const connected = provider.status === "available"

  return (
    <li className="flex flex-col gap-2 py-2.5 first:pt-0 last:pb-0">
      <div className="flex items-center gap-3">
        <span className={`size-[7px] shrink-0 rounded-full ${statusDotClassNames[provider.status]}`} role="img" aria-label={statusLabels[provider.status]} />
        <div className="min-w-0 flex-1">
          <p className="m-0 text-control font-medium text-primary">{provider.name}</p>
          <p className="m-0 mt-0.5 text-support text-muted">{describeProvider(provider)}</p>
        </div>
        {provider.connection === "api-key" && connected && <Button variant="text" type="button" disabled={busy} onClick={() => disconnect({ provider: provider.provider })}>Desconectar</Button>}
        {provider.connection === "api-key" && !connected && provider.detectedKey && <Button variant="secondary" type="button" disabled={busy} onClick={() => connect({ provider: provider.provider })}>Usar a chave</Button>}
        {provider.connection === "api-key" && !connected && <Button variant={provider.detectedKey ? "text" : "secondary"} type="button" disabled={busy} onClick={() => setPasting(true)}>{provider.detectedKey ? "Colar outra" : "Conectar"}</Button>}
      </div>
      {failure && <p className="m-0 text-support text-status-error">{failure}</p>}
      {pasting && <ConnectProviderDialog name={provider.name} onClose={() => setPasting(false)} onConnect={(key) => connect({ provider: provider.provider, key })} />}
    </li>
  )
}

function ConnectProviderDialog({ name, onClose, onConnect }: { name: string; onClose: () => void; onConnect: (key: string) => void }) {
  const [key, setKey] = useState("")
  const trimmed = key.trim()

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!trimmed) {
      return
    }

    onConnect(trimmed)
    onClose()
  }

  return (
    <Dialog eyebrow="Fornecedor" title={`Conectar o ${name}`} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <DialogBody>
          <p className="m-0 text-support text-muted">O {name} usa uma chave de API para a assinatura. Crie a sua em opencode.ai/auth. A chave fica só neste computador.</p>
          <Field label="Chave da API">
            <input className={fieldControlClassName} type="password" autoFocus autoComplete="off" placeholder="sk-..." value={key} onChange={(event) => setKey(event.target.value)} />
          </Field>
        </DialogBody>
        <DialogActions>
          <Button variant="text" type="button" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={!trimmed}>Conectar</Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
