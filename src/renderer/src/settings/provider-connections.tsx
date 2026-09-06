import { useMutation, useQuery } from "@tanstack/react-query"
import { type FormEvent, useState } from "react"
import type { ProviderAvailability } from "@src/shared/providers"
import type { EngineClient } from "../engine-client"
import { Button } from "../ui/button"
import { Dialog, DialogActions, DialogBody } from "../ui/dialog"
import { Field, fieldControlClassName } from "../ui/field"
import { SettingsSection, settingsPanelClassName } from "../ui/settings-section"
import { useDisconnectProvider, useRefreshProviders } from "./provider-mutations"
import { SubscriptionConnection } from "./subscription-connection"

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
  if (provider.connected && provider.status !== "available") {
    return "Conta conectada · modelos indisponíveis"
  }

  if (provider.status === "incompatible") {
    return "Não foi possível verificar a conexão. Tente novamente."
  }

  if (provider.status === "available") {
    if (provider.connection === "subscription") {
      return "Conectado com sua conta do ChatGPT"
    }

    return "Conectado com uma chave de API"
  }

  if (provider.connection === "subscription") {
    return "Sua conta do ChatGPT"
  }

  if (!provider.detectedKey) {
    return "Chave de API"
  }

  return "Chave de API encontrada neste computador"
}

export function ProviderConnections({ client }: { client: EngineClient }) {
  const { data, error, isPending, refetch } = useQuery(client.query.providers.list.queryOptions())

  return (
    <SettingsSection title="Inscrições">
      {error && <p className="m-0 text-support text-status-error">Não foi possível verificar as inscrições. <button type="button" className="underline" onClick={() => void refetch()}>Tentar novamente</button></p>}
      {isPending && <p className="m-0 text-support text-muted">Verificando inscrições…</p>}
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
  const { mutate: disconnect, isPending, error } = useDisconnectProvider(client)

  return (
    <li className="flex flex-col gap-2 py-2.5 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`size-[7px] shrink-0 rounded-full ${statusDotClassNames[provider.status]}`} role="img" aria-label={statusLabels[provider.status]} />
        <div className="min-w-40 flex-1">
          <p className="m-0 text-control font-medium text-primary">{provider.name}</p>
          <p className="m-0 mt-0.5 text-support text-secondary">{describeProvider(provider)}</p>
        </div>
        {provider.connected && <Button variant="secondary" type="button" disabled={isPending} onClick={() => disconnect({ provider: provider.provider })}>{isPending ? "Desconectando…" : "Desconectar"}</Button>}
        {provider.connection === "subscription" ? <SubscriptionConnection client={client} connected={provider.connected} /> : <ApiKeyConnection client={client} provider={provider} />}
      </div>
      {provider.connected && provider.status !== "available" && <p className="m-0 text-support text-secondary">Desconecte e conecte novamente para tentar recuperar o acesso.</p>}
      {error && <p className="m-0 text-support text-status-error" role="alert">Não foi possível desconectar. Tente novamente.</p>}
    </li>
  )
}

function ApiKeyConnection({ client, provider }: { client: EngineClient; provider: Pick<ProviderAvailability, "provider" | "name" | "connected" | "detectedKey"> }) {
  const refresh = useRefreshProviders(client)
  const [pasting, setPasting] = useState(false)
  const { mutate: connect, isPending, error } = useMutation(client.query.providers.connect.mutationOptions({
    async onSuccess() {
      await refresh()
      setPasting(false)
    },
  }))

  return (
    <>
      {!provider.connected && provider.detectedKey && <Button variant="secondary" type="button" disabled={isPending} onClick={() => connect({ provider: provider.provider })}>{isPending ? "Conectando…" : "Usar esta chave"}</Button>}
      {!provider.connected && <Button variant={provider.detectedKey ? "text" : "secondary"} type="button" disabled={isPending} aria-label={`Conectar ${provider.name}`} onClick={() => setPasting(true)}>{provider.detectedKey ? "Usar outra chave" : "Conectar"}</Button>}
      {error && !pasting && <p className="m-0 w-full text-support text-status-error" role="alert">Não foi possível usar esta chave. Tente novamente ou use outra.</p>}
      {pasting && <ConnectProviderDialog name={provider.name} busy={isPending} error={error?.message} onClose={() => !isPending && setPasting(false)} onConnect={(key) => connect({ provider: provider.provider, key })} />}
    </>
  )
}

function ConnectProviderDialog({ name, busy, error, onClose, onConnect }: { name: string; busy: boolean; error: string | undefined; onClose: () => void; onConnect: (key: string) => void }) {
  const [key, setKey] = useState("")
  const [browserError, setBrowserError] = useState(false)
  const trimmed = key.trim()

  async function obtainKey() {
    setBrowserError(false)
    await window.desktop.openInBrowser("https://opencode.ai/auth").catch(() => setBrowserError(true))
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!trimmed || busy) {
      return
    }

    onConnect(trimmed)
  }

  return (
    <Dialog eyebrow="Inscrição" title={`Conectar ${name}`} onClose={onClose}>
      <form className="flex min-h-0 flex-col" onSubmit={handleSubmit}>
        <DialogBody>
          <p className="m-0 text-support text-secondary">Abra sua conta no OpenCode, copie a chave de API do plano Go e cole abaixo.</p>
          <Button variant="secondary" type="button" onClick={obtainKey}>Obter chave</Button>
          {browserError && <p className="m-0 text-support text-status-error" role="alert">Não foi possível abrir o navegador. Acesse opencode.ai/auth para obter sua chave.</p>}
          {error && <p className="m-0 text-support text-status-error" role="alert">Não foi possível salvar a chave. Tente novamente.</p>}
          <Field label="Chave de API">
            <input className={fieldControlClassName} type="password" autoFocus autoComplete="off" placeholder="sk-..." value={key} onChange={(event) => setKey(event.target.value)} />
          </Field>
          <p className="m-0 text-support text-secondary">A chave fica salva neste computador.</p>
        </DialogBody>
        <DialogActions>
          <Button variant="text" type="button" disabled={busy} onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={!trimmed || busy}>{busy ? "Conectando…" : "Conectar"}</Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
