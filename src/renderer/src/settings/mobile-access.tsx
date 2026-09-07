import { DevicePhoneMobileIcon } from "@heroicons/react/24/outline"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { QRCodeSVG } from "qrcode.react"
import { type ReactNode, useState } from "react"
import type { MobileAccess, MobileAccessUpdate } from "@src/shared/mobile-access"
import { Button } from "../ui/button"
import { ConfirmationDialog } from "../ui/dialog"
import { SettingsSection, settingsPanelClassName } from "../ui/settings-section"
import { Switch } from "../ui/switch"

const queryKey = ["mobile-access"]
const copiedDelayMs = 1_500

export function MobileAccessSettings() {
  if (window.desktop.remote) {
    return (
      <SettingsSection title="Celular">
        <p className={`${settingsPanelClassName} m-0 text-support text-secondary`}>O pareamento é feito no notebook, em Configurações → Celular. Neste celular você acompanha e responde as conversas.</p>
      </SettingsSection>
    )
  }

  return <MobileAccessPanel />
}

function MobileAccessPanel() {
  const queryClient = useQueryClient()
  const { data, error } = useQuery({ queryKey, queryFn: () => window.desktop.getMobileAccess(), refetchInterval: 15_000 })
  const [unpairing, setUnpairing] = useState(false)
  const replace = (access: MobileAccess) => queryClient.setQueryData(queryKey, access)
  const { mutate: configure, isPending: configuring, error: configureError } = useMutation({ mutationFn: (update: MobileAccessUpdate) => window.desktop.configureMobileAccess(update), onSuccess: replace })
  const { mutate: unpair, isPending: unpairPending, error: unpairError } = useMutation({ mutationFn: () => window.desktop.unpairMobileAccess(), onSuccess(access) {
    replace(access)
    setUnpairing(false)
  } })
  const failure = error ?? configureError

  return (
    <SettingsSection title="Celular">
      <div className={`${settingsPanelClassName} flex flex-col gap-4`}>
        {data && (
          <>
            <Row label="Tailscale" description="Hostname deste notebook na sua rede Tailscale.">
              <span className="text-control text-secondary">{data.hostname ?? "Desligado"}</span>
            </Row>
            <Row label="Acesso pelo celular" description="Expõe o Mimo em HTTPS só dentro da sua rede Tailscale e mantém o notebook acordado na tomada.">
              <Switch checked={data.enabled} disabled={configuring} aria-label="Acesso pelo celular" onChange={(enabled) => configure({ enabled })} />
            </Row>
            {data.enabled && data.onBattery && <p className="m-0 text-support text-status-warning">Na bateria o notebook pode dormir. Conecte na tomada para manter o acesso.</p>}
            {data.enabled && <Pairing access={data} />}
            <Row label="Acesso dos celulares" description="Troca a credencial. Todos os celulares precisam ler o QR de novo.">
              <Button variant="danger" type="button" onClick={() => setUnpairing(true)}>Desparear todos</Button>
            </Row>
          </>
        )}
        {!data && !error && <p className="m-0 text-support text-muted">Lendo o Tailscale...</p>}
        {failure && <p className="m-0 text-support text-status-error" role="alert">{failure.message}</p>}
      </div>
      {unpairing && (
        <ConfirmationDialog
          icon={<DevicePhoneMobileIcon />}
          title="Desparear todos os celulares"
          onClose={() => !unpairPending && setUnpairing(false)}
          actions={(
            <>
              <Button variant="text" type="button" autoFocus disabled={unpairPending} onClick={() => setUnpairing(false)}>Cancelar</Button>
              <Button variant="danger" type="button" disabled={unpairPending} onClick={() => unpair()}>{unpairPending ? "Despareando..." : "Desparear todos"}</Button>
            </>
          )}
        >
          <p className="m-0 text-control text-secondary">Todos os celulares perdem o acesso agora. Os Turnos em andamento continuam. Para voltar, leia o novo QR.</p>
          {unpairError && <p className="m-0 text-support text-status-error">Falha ao desparear: {unpairError.message}</p>}
        </ConfirmationDialog>
      )}
    </SettingsSection>
  )
}

function Pairing({ access }: { access: MobileAccess }) {
  if (!access.hostname) {
    return <p className="m-0 text-support text-secondary">Ligue o Tailscale neste notebook e no celular. O link só funciona dentro da sua rede Tailscale.</p>
  }

  if (access.failure) {
    return <ServeFailure failure={access.failure} port={access.targetPort} />
  }

  if (!access.link) {
    return <p className="m-0 text-support text-secondary">Configurando o Tailscale...</p>
  }

  return (
    <div className="flex flex-col gap-3">
      <Row label="Link de pareamento" description="O QR contém uma credencial: não compartilhe nem registre o link em logs.">
        <CopyButton content={access.link} />
      </Row>
      <div className="flex flex-col items-center gap-3 self-start rounded-lg border border-outline bg-surface p-4">
        <div className="rounded-md bg-primary p-3">
          <QRCodeSVG value={access.link} size={176} marginSize={0} bgColor="transparent" fgColor="var(--color-canvas)" />
        </div>
        <p className="m-0 max-w-44 text-center text-support text-secondary">No celular, leia o código com a câmera. O Mimo abre no navegador.</p>
      </div>
    </div>
  )
}

function ServeFailure({ failure: { message, enableUrl }, port }: { failure: NonNullable<MobileAccess["failure"]>; port: number }) {
  const command = `tailscale serve --bg --https=443 http://127.0.0.1:${port}`

  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 text-support text-status-error" role="alert">{message}</p>
      {enableUrl && <Button variant="secondary" type="button" className="self-start" onClick={() => window.desktop.openInBrowser(enableUrl)}>Ativar HTTPS no Tailscale</Button>}
      <p className="m-0 text-support text-secondary">Ou rode no terminal:</p>
      <div className="flex items-center gap-3">
        <code className="min-w-0 flex-1 rounded-lg bg-canvas px-3 py-2 text-metadata text-primary break-all">{command}</code>
        <CopyButton content={command} />
      </div>
    </div>
  )
}

function CopyButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), copiedDelayMs)
  }

  return <Button variant="secondary" type="button" onClick={copy}>{copied ? "Copiado" : "Copiar"}</Button>
}

function Row({ label, description, children }: { label: string; description: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6">
      <div className="min-w-0 flex-1">
        <p className="m-0 text-control font-medium text-primary">{label}</p>
        <p className="m-0 mt-1 max-w-[46ch] text-support font-normal text-muted">{description}</p>
      </div>
      {children}
    </div>
  )
}

export function MobilePairingRequired() {
  return (
    <main className="flex h-dvh items-center justify-center bg-canvas p-6 text-center font-sans">
      <div className="flex max-w-[40ch] flex-col items-center gap-3">
        <DevicePhoneMobileIcon className="size-8 text-muted" aria-hidden="true" />
        <h1 className="m-0 text-title font-semibold text-primary">Pareie este celular</h1>
        <p className="m-0 text-support text-secondary">No notebook, abra Configurações → Celular e leia o QR com a câmera. O link abre o Mimo aqui.</p>
      </div>
    </main>
  )
}
