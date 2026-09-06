import { ArrowTopRightOnSquareIcon, CheckCircleIcon } from "@heroicons/react/24/outline"
import { useMutation, useQuery } from "@tanstack/react-query"
import { type FormEvent, useState } from "react"
import type { ProviderLogin } from "@src/shared/providers"
import type { EngineClient } from "../engine-client"
import { Button } from "../ui/button"
import { Dialog, DialogActions, DialogBody } from "../ui/dialog"
import { Field, fieldControlClassName } from "../ui/field"
import { useDisconnectProvider, useRefreshProviders } from "./provider-mutations"

const loginTitle = { pending: "Continue no navegador", connected: "Conta conectada", failed: "Não foi possível conectar" }

export function SubscriptionConnection({ client, connected }: { client: EngineClient; connected: boolean }) {
  const [opened, setOpened] = useState(false)
  const [attempt, setAttempt] = useState<ProviderLogin>()
  const [browserError, setBrowserError] = useState(false)

  async function openBrowser(url: string) {
    setBrowserError(false)
    await window.desktop.openInBrowser(url).catch(() => setBrowserError(true))
  }

  const { mutate: start, isPending, error } = useMutation(client.query.providers.login.mutationOptions({
    async onSuccess(result) {
      setAttempt(result)

      if (result.url) {
        await openBrowser(result.url)
      }
    },
  }))

  function connect() {
    setAttempt(undefined)
    setBrowserError(false)
    setOpened(true)
    start(undefined)
  }

  return (
    <>
      {!connected && <Button variant="primary" type="button" disabled={isPending} aria-label="Conectar ChatGPT" onClick={connect}>Conectar</Button>}
      {opened && !attempt && (
        <Dialog eyebrow="ChatGPT" title="Conectar sua conta" onClose={() => !isPending && setOpened(false)}>
          <DialogBody><p className="m-0 text-body text-secondary" role="status">{error ? "Não foi possível iniciar a conexão. Tente novamente." : "Preparando conexão…"}</p></DialogBody>
          <DialogActions>
            <Button variant="text" type="button" disabled={isPending} onClick={() => setOpened(false)}>Fechar</Button>
            {error && <Button type="button" onClick={connect}>Tentar novamente</Button>}
          </DialogActions>
        </Dialog>
      )}
      {opened && attempt && <SubscriptionDialog key={attempt.id} client={client} initial={attempt} browserError={browserError} openBrowser={openBrowser} onClose={() => setOpened(false)} onRetry={connect} />}
    </>
  )
}

function SubscriptionDialog({ client, initial, browserError, openBrowser, onClose, onRetry }: {
  client: EngineClient
  initial: ProviderLogin
  browserError: boolean
  openBrowser: (url: string) => Promise<void>
  onClose: () => void
  onRetry: () => void
}) {
  const refresh = useRefreshProviders(client)
  const input = { id: initial.id }

  const { data: state, error: statusError, refetch } = useQuery(client.query.providers.loginStatus.queryOptions({
    input,
    initialData: initial,
    refetchInterval: (query) => query.state.data?.status === "pending" ? 700 : false,
    refetchIntervalInBackground: true,
    queryFn: async () => {
      const result = await client.raw.providers.loginStatus(input)

      if (result.status === "connected") {
        await refresh()
      }

      return result
    },
  }))
  const { mutate: cancel, isPending: cancelling, error: cancelError } = useMutation(client.query.providers.cancelLogin.mutationOptions({
    async onSuccess() {
      await refresh()
      onClose()
    },
  }))
  const pending = state.status === "pending"

  function close() {
    if (pending && !cancelError) {
      cancel(input)
      return
    }

    onClose()
  }

  if (state.status === "connected") {
    return <ConnectedSubscription client={client} onClose={onClose} />
  }

  return (
    <Dialog eyebrow="ChatGPT" title={loginTitle[state.status]} onClose={close}>
      <DialogBody>
        {pending && <PendingLogin client={client} state={state} browserError={browserError} cancelling={cancelling} onOpenBrowser={openBrowser} onSubmitted={() => void refetch()} />}
        {state.message && <p className="m-0 text-support text-status-error" role="alert">{state.message}</p>}
        {(statusError || cancelError) && <p className="m-0 text-support text-status-error" role="alert">Não foi possível verificar a conexão. <button type="button" className="underline" onClick={() => void refetch()}>Verificar novamente</button></p>}
      </DialogBody>
      <DialogActions>
        <Button variant="text" type="button" disabled={cancelling} onClick={close}>{pending ? "Cancelar" : "Fechar"}</Button>
        {state.status === "failed" && <Button type="button" onClick={onRetry}>Tentar novamente</Button>}
      </DialogActions>
    </Dialog>
  )
}

function PendingLogin({ browserError, cancelling, client, onOpenBrowser, onSubmitted, state }: { browserError: boolean; cancelling: boolean; client: EngineClient; onOpenBrowser: (url: string) => Promise<void>; onSubmitted: () => void; state: Pick<ProviderLogin, "id" | "url" | "manual"> }) {
  const url = state.url

  return (
    <>
      <p className="m-0 text-body text-secondary">Conclua o login. A conexão será confirmada automaticamente aqui.</p>
      <p className="m-0 text-support text-secondary">Sua conta precisa ter acesso ao Codex. Valem os limites do seu plano.</p>
      <p className="m-0 text-support text-secondary" role="status">{cancelling ? "Cancelando conexão…" : "Aguardando a confirmação do ChatGPT…"}</p>
      {url && <Button className="flex items-center justify-center gap-2" variant="secondary" type="button" onClick={() => void onOpenBrowser(url)}>Abrir navegador <ArrowTopRightOnSquareIcon className="size-4" aria-hidden="true" /></Button>}
      {browserError && <p className="m-0 text-support text-status-warning" role="alert">O navegador não abriu. Use o botão acima para continuar.</p>}
      {state.manual && <ManualReturn client={client} id={state.id} onSubmitted={onSubmitted} />}
    </>
  )
}

function ManualReturn({ client, id, onSubmitted }: { client: EngineClient; id: string; onSubmitted: () => void }) {
  const [url, setUrl] = useState("")
  const input = { id }
  const { mutate: reply, isPending: submitting, isSuccess: submitted, error: replyError } = useMutation(client.query.providers.loginReply.mutationOptions({
    onSuccess() {
      setUrl("")
      onSubmitted()
    },
  }))

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    reply({ ...input, url: url.trim() })
  }

  if (submitted) {
    return <p className="m-0 text-support text-secondary" role="status">Confirmando sua conexão…</p>
  }

  return (
    <details className="text-support text-secondary">
      <summary className="cursor-pointer rounded-sm py-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus">Entrei, mas não conectou</summary>
      <form className="mt-3 flex flex-col gap-3" onSubmit={submit}>
        <p className="m-0">Copie o endereço completo da última página aberta pelo login e cole abaixo. Ele começa com http://localhost:1455/auth/callback.</p>
        <Field label="Endereço de retorno"><input className={fieldControlClassName} type="url" autoComplete="off" value={url} onChange={(event) => setUrl(event.target.value)} /></Field>
        <Button variant="secondary" type="submit" disabled={!url.trim() || submitting}>{submitting ? "Confirmando…" : "Confirmar conexão"}</Button>
        {replyError && <p className="m-0 text-status-error" role="alert">{replyError.message}</p>}
      </form>
    </details>
  )
}

function ConnectedSubscription({ client, onClose }: { client: EngineClient; onClose: () => void }) {
  const { mutate: disconnect, isPending, error } = useDisconnectProvider(client)

  return (
    <Dialog eyebrow="ChatGPT" title={loginTitle.connected} onClose={onClose}>
      <DialogBody>
        <div className="flex items-start gap-3" role="status">
          <CheckCircleIcon className="mt-1 size-5 shrink-0 text-status-success" aria-hidden="true" />
          <p className="m-0 text-body text-secondary">Conexão salva neste computador. Para alterá-la, acesse Configurações → Inscrições.</p>
        </div>
        {error && <p className="m-0 text-support text-status-error" role="alert">Não foi possível desconectar. Tente novamente.</p>}
      </DialogBody>
      <DialogActions>
        <Button variant="secondary" type="button" disabled={isPending} onClick={() => disconnect({ provider: "codex" }, { onSuccess: onClose })}>{isPending ? "Desconectando…" : "Desconectar"}</Button>
        <Button type="button" disabled={isPending} onClick={onClose}>Concluir</Button>
      </DialogActions>
    </Dialog>
  )
}
