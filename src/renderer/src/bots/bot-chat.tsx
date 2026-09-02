import { Cog6ToothIcon, XMarkIcon } from "@heroicons/react/24/outline"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { ChatEdgeTab } from "../chat/chat-edge-tab"
import { ChatWorkspace } from "../chat/chat-workspace"
import type { EngineClient } from "../engine-client"
import { EmptyState } from "../ui/empty-state"
import { IconButton } from "../ui/icon-button"
import { BotSettings } from "./bot-settings"
import { findTeamBot } from "./team"

export function BotChat({ client, botId }: { client: EngineClient; botId: string | null }) {
  const [showSettings, setShowSettings] = useState(false)
  const { data: groups, error, isPending } = useQuery(client.query.projects.list.queryOptions())
  const bot = botId ? findTeamBot(groups, botId) : undefined

  if (!botId) {
    return <EmptyState title="Escolha um Bot" description="Abra um da lista ou crie um novo." />
  }

  if (error) {
    return <p className="p-7 text-support text-status-error">Falha ao abrir o Bot: {error.message}</p>
  }

  if (isPending) {
    return <p className="p-7 text-muted">Abrindo Bot...</p>
  }

  if (!bot) {
    return <EmptyState title="Bot não encontrado" description="Ele foi removido. Escolha outro da lista." />
  }

  return (
    <>
      {showSettings ? <BotSettings bot={bot} client={client} onClose={() => setShowSettings(false)} /> : <ChatWorkspace bot={bot} client={client} />}
      <ChatEdgeTab>
        {showSettings
          ? <IconButton iconSize={16} type="button" label="Fechar configurações" tooltipPlacement="left" onClick={() => setShowSettings(false)}><XMarkIcon aria-hidden="true" /></IconButton>
          : <IconButton iconSize={16} type="button" label={`Abrir configurações de ${bot.name}`} tooltipPlacement="left" onClick={() => setShowSettings(true)}><Cog6ToothIcon aria-hidden="true" /></IconButton>}
      </ChatEdgeTab>
    </>
  )
}
