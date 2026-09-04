import { QRCodeSVG } from "qrcode.react"
import type { PluginStep } from "@src/shared/plugins"

export function pluginStepLabel(step: PluginStep | undefined) {
  if (step?.type === "qr") {
    return "Aguardando a leitura..."
  }

  return "Aguardando o navegador..."
}

export function PluginStepView({ step }: { step: PluginStep | undefined }) {
  if (step?.type !== "qr") {
    return null
  }

  return (
    <div className="flex flex-col items-center gap-3 self-start rounded-lg border border-outline bg-surface p-4">
      <div className="rounded-md bg-primary p-3">
        <QRCodeSVG value={step.code} size={176} marginSize={0} bgColor="transparent" fgColor="var(--color-canvas)" />
      </div>
      <div className="flex max-w-44 flex-col gap-1">
        <p className="m-0 text-center text-support text-secondary">No celular, abra o WhatsApp · Aparelhos conectados e leia o código.</p>
        <p className="m-0 text-center text-support text-muted">O WhatsApp não autoriza clientes de terceiros. A conta pode ser bloqueada.</p>
      </div>
    </div>
  )
}
