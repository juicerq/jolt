import { ChatBubbleLeftIcon, ClockIcon, Cog6ToothIcon } from "@heroicons/react/24/outline"
import { useQuery } from "@tanstack/react-query"
import { useSelector } from "@tanstack/react-store"
import type { Bot } from "@src/shared/bots"
import type { ProjectGroups } from "@src/shared/projects"
import { ChatEdgeTab } from "../chat/chat-edge-tab"
import { ChatWorkspace } from "../chat/chat-workspace"
import type { EngineClient } from "../engine-client"
import { EmptyState } from "../ui/empty-state"
import { IconButton } from "../ui/icon-button"
import { BrainIcon } from "../ui/brain-icon"
import { InlineAction } from "../ui/inline-action"
import { BotMemory } from "./bot-memory"
import { BotRoutineEditor } from "./bot-routine-editor"
import { BotRoutines } from "./bot-routines"
import { BotSettings } from "./bot-settings"
import { type BotRoute, botsStore, openBotRoute, openCreateBot } from "./bots-store"
import { findTeamBot, teamOf } from "./team"

export function BotChat({ client, botId }: { client: EngineClient; botId: string | null }) {
  const route = useSelector(botsStore, (state) => state.botRoute)
  const { data: groups, error, isPending } = useQuery(client.query.projects.list.queryOptions())
  const bot = botId ? findTeamBot(groups, botId) : undefined

  if (!botId) {
    return <EmptyState title="Escolha um Bot" description={<>Abra um da lista ou <InlineAction type="button" onClick={openCreateBot}>crie um novo</InlineAction>.</>} />
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
      <BotRouteScreen bot={bot} client={client} groups={groups} route={route} />
      <BotRouteTab bot={bot} route={route} />
    </>
  )
}

function BotRouteScreen({ bot, client, groups, route }: { bot: Bot; client: EngineClient; groups: ProjectGroups | undefined; route: BotRoute }) {
  const { leader } = teamOf(groups, bot)
  const close = () => openBotRoute({ name: "chat" })
  const openRoutines = () => openBotRoute({ name: "routines" })

  if (route.name === "settings") {
    return <BotSettings bot={bot} client={client} onClose={close} />
  }

  if (route.name === "routines") {
    return <BotRoutines bot={bot} client={client} onClose={close} onCreate={() => openBotRoute({ name: "routine", id: "new" })} onEdit={(id) => openBotRoute({ name: "routine", id })} />
  }

  if (route.name === "memory") {
    return <BotMemory bot={bot} client={client} {...(leader ? { leader } : {})} onClose={close} />
  }

  if (route.name === "routine") {
    return <BotRoutineEditor bot={bot} client={client} routineId={route.id} onClose={openRoutines} />
  }

  return <ChatWorkspace bot={bot} client={client} />
}

function BotRouteTab({ bot, route }: { bot: Bot; route: BotRoute }) {
  function open(name: "settings" | "routines" | "memory") {
    if (route.name === name) {
      openBotRoute({ name: "chat" })
      return
    }

    if (name === "routines" && route.name === "routine") {
      openBotRoute({ name: "routines" })
      return
    }

    openBotRoute({ name })
  }

  return (
    <ChatEdgeTab>
      <IconButton iconSize={16} current={route.name === "chat"} type="button" label={`Conversa de ${bot.name}`} tooltipPlacement="left" onClick={() => openBotRoute({ name: "chat" })}><ChatBubbleLeftIcon aria-hidden="true" /></IconButton>
      <IconButton iconSize={16} current={route.name === "settings"} type="button" label={`Configurações de ${bot.name}`} tooltipPlacement="left" onClick={() => open("settings")}><Cog6ToothIcon aria-hidden="true" /></IconButton>
      {!bot.temporary && <IconButton iconSize={16} current={route.name === "routines" || route.name === "routine"} type="button" label={`Rotinas de ${bot.name}`} tooltipPlacement="left" onClick={() => open("routines")}><ClockIcon aria-hidden="true" /></IconButton>}
      <IconButton iconSize={16} current={route.name === "memory"} type="button" label={`Memórias de ${bot.name}`} tooltipPlacement="left" onClick={() => open("memory")}><BrainIcon aria-hidden="true" /></IconButton>
    </ChatEdgeTab>
  )
}
