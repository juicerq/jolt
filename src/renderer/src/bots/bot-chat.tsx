import { skipToken, useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { ChatWorkspace } from "../chat/chat-workspace"
import type { EngineClient } from "../engine-client"
import { BotSettings } from "./bot-settings"

export function BotChat({ client, botId }: { client: EngineClient; botId: string | null }) {
  const [showSettings, setShowSettings] = useState(false)
  const { data, error, isPending } = useQuery(client.query.bots.get.queryOptions({ input: botId ? { id: botId } : skipToken }))

  if (!botId) {
    return <div className="bot-placeholder"><strong>Escolha um Bot</strong><p>Abra um Bot da lista ou crie um novo.</p></div>
  }

  if (error) {
    return <p className="error bot-opening">Falha ao abrir o Bot: {error.message}</p>
  }

  if (isPending || !data) {
    return <p className="empty bot-opening">Abrindo Bot...</p>
  }

  return (
    <>
      <ChatWorkspace bot={data} client={client} onOpenSettings={() => setShowSettings(true)} />
      {showSettings && <BotSettings bot={data} client={client} onClose={() => setShowSettings(false)} />}
    </>
  )
}
