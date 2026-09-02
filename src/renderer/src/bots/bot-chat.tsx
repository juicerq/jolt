import { Cog6ToothIcon, XMarkIcon } from "@heroicons/react/24/outline"
import { skipToken, useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { ChatEdgeTab } from "../chat/chat-edge-tab"
import { ChatWorkspace } from "../chat/chat-workspace"
import type { EngineClient } from "../engine-client"
import { EmptyState } from "../ui/empty-state"
import { IconButton } from "../ui/icon-button"
import { BotSettings } from "./bot-settings"

export function BotChat({ client, botId }: { client: EngineClient; botId: string | null }) {
  const [showSettings, setShowSettings] = useState(false)
  const { data, error, isPending } = useQuery(client.query.bots.get.queryOptions({ input: botId ? { id: botId } : skipToken }))

  if (!botId) {
    return <EmptyState title="Escolha um Bot" description="Abra um da lista ou crie um novo." />
  }

  if (error) {
    return <p className="p-7 text-support text-status-error">Falha ao abrir o Bot: {error.message}</p>
  }

  if (isPending || !data) {
    return <p className="p-7 text-muted">Abrindo Bot...</p>
  }

  return (
    <>
      {showSettings ? <BotSettings bot={data} client={client} onClose={() => setShowSettings(false)} /> : <ChatWorkspace bot={data} client={client} />}
      <ChatEdgeTab>
        {showSettings
          ? <IconButton iconSize={16} type="button" label="Fechar configurações" tooltipPlacement="left" onClick={() => setShowSettings(false)}><XMarkIcon aria-hidden="true" /></IconButton>
          : <IconButton iconSize={16} type="button" label={`Abrir configurações de ${data.name}`} tooltipPlacement="left" onClick={() => setShowSettings(true)}><Cog6ToothIcon aria-hidden="true" /></IconButton>}
      </ChatEdgeTab>
    </>
  )
}
