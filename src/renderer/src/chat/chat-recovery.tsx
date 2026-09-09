import { ClockIcon } from "@heroicons/react/24/outline"
import { useSelector } from "@tanstack/react-store"
import { useState } from "react"
import type { Bot } from "@src/shared/bots"
import type { ConversationEvent } from "@src/shared/conversations"
import type { EngineClient } from "../engine-client"
import { connectionStore } from "../connection"
import { Button } from "../ui/button"
import { Dialog, DialogBody } from "../ui/dialog"
import { useUpdateBotExecution } from "./chat-bot-update"
import { ChatModelOptions, useBotModel } from "./chat-model-picker"

export function ChatProviderWaiting({ bot, client, wait, aborting }: { bot: Bot; client: EngineClient; wait: Extract<ConversationEvent, { type: "provider-waiting" }>; aborting: boolean }) {
  const { catalogs } = useBotModel(bot, client)
  const provider = catalogs.find((catalog) => catalog.provider === bot.provider)?.name ?? "provedor"

  return (
    <div className="grid max-w-full grid-cols-[16px_auto] items-start gap-x-2 gap-y-1 text-support text-secondary" role="status">
      <ClockIcon className="mt-px size-4" aria-hidden="true" />
      <span>{aborting ? "Interrompendo…" : `Aguardando o ${provider}…`}</span>
      {!aborting && <span className="col-start-2">Nova tentativa {wait.attempt} de {wait.maxAttempts} após {Math.ceil(wait.delayMs / 1000)} s.</span>}
    </div>
  )
}

export function ChatRecoveryActions({ bot, client, onRetry }: { bot: Bot; client: EngineClient; onRetry: () => Promise<boolean> }) {
  const connected = useSelector(connectionStore, (state) => state.connected)
  const [choosingModel, setChoosingModel] = useState(false)
  const execution = useUpdateBotExecution(bot, client)
  const disabled = !connected || execution.isPending

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={disabled} onClick={() => void onRetry()}>Tentar novamente</Button>
        <Button variant="text" disabled={disabled} onClick={() => setChoosingModel(true)}>Trocar modelo</Button>
      </div>
      <p className="m-0 text-support text-secondary">A retomada usa o histórico e o trabalho já realizado.</p>
      {execution.error && <p className="m-0 text-support text-status-error" role="alert">Não foi possível trocar o modelo: {execution.error.message}</p>}
      {choosingModel && <Dialog eyebrow={bot.name} title="Trocar modelo" onClose={() => setChoosingModel(false)}><DialogBody>
        <ChatModelOptions bot={bot} client={client} execution={execution} autoFocusSearch onChoose={() => setChoosingModel(false)} />
      </DialogBody></Dialog>}
    </div>
  )
}
