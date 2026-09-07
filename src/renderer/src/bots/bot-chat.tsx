import { BoltIcon, ChatBubbleLeftIcon, ClockIcon, Cog6ToothIcon, ComputerDesktopIcon, UserGroupIcon } from "@heroicons/react/24/outline"
import { useQuery } from "@tanstack/react-query"
import { useSelector } from "@tanstack/react-store"
import type { ReactNode } from "react"
import type { Bot } from "@src/shared/bots"
import type { ProjectGroups } from "@src/shared/projects"
import { browserStore } from "../browser/browser-store"
import { ChatEdgeTab } from "../chat/chat-edge-tab"
import { ChatWorkspace } from "../chat/chat-workspace"
import type { EngineClient } from "../engine-client"
import { EmptyState } from "../ui/empty-state"
import { IconButton } from "../ui/icon-button"
import { BrainIcon } from "../ui/brain-icon"
import { InlineAction } from "../ui/inline-action"
import { useIsMobile } from "../ui/use-is-mobile"
import { ProviderWelcome } from "../settings/provider-welcome"
import { BotMemory } from "./bot-memory"
import { BotMembers } from "./bot-members"
import { BotRoutineEditor } from "./bot-routine-editor"
import { BotRoutines } from "./bot-routines"
import { BotSettings } from "./bot-settings"
import { BotTriggerEditor } from "./bot-trigger-editor"
import { BotTriggers } from "./bot-triggers"
import { type BotRoute, botsStore, openBotRoute, openCreateBot, toggleBrowserSidebar } from "./bots-store"
import { findTeamBot, teamOf } from "./team"

type BotRouteActionName = "chat" | "settings" | "members" | "routines" | "triggers" | "memory"

interface BotRouteAction {
  name: BotRouteActionName
  label: string
  icon: ReactNode
  current: boolean
  select: () => void
}

export function BotChat({ client, botId }: { client: EngineClient; botId: string | null }) {
  const route = useSelector(botsStore, (state) => state.botRoute)
  const { data: groups, error, isPending } = useQuery(client.query.projects.list.queryOptions())
  const bot = botId ? findTeamBot(groups, botId) : undefined

  if (error) {
    return <p className="p-7 text-support text-status-error">Falha ao carregar os Bots: {error.message}</p>
  }

  if (isPending) {
    return <p className="p-7 text-muted">{botId ? "Abrindo Bot..." : "Carregando Bots..."}</p>
  }

  if (!botId) {
    if (groups && (groups.unassignedBots.length > 0 || groups.projects.some((project) => project.bots.length > 0))) {
      return <EmptyState title="Escolha um Bot" description={<>Abra um da lista ou <InlineAction type="button" onClick={openCreateBot}>crie um novo</InlineAction>.</>} />
    }

    return <ProviderWelcome client={client} />
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

  if (route.name === "members" && !bot.leaderBotId) {
    return <BotMembers key={bot.id} bot={bot} client={client} groups={groups} onClose={close} />
  }

  if (route.name === "settings") {
    return <BotSettings bot={bot} client={client} onClose={close} />
  }

  if (route.name === "routines") {
    return <BotRoutines bot={bot} client={client} onClose={close} onCreate={() => openBotRoute({ name: "routine", id: "new" })} onEdit={(id) => openBotRoute({ name: "routine", id })} />
  }

  if (route.name === "memory") {
    return <BotMemory bot={bot} client={client} {...(leader ? { leader } : {})} onClose={close} />
  }

  if (route.name === "triggers") {
    return <BotTriggers bot={bot} client={client} onClose={close} onEdit={(id) => openBotRoute({ name: "trigger", id })} />
  }

  if (route.name === "trigger") {
    return <BotTriggerEditor key={`${bot.id}:${route.id}`} bot={bot} client={client} triggerId={route.id} onClose={() => openBotRoute({ name: "triggers" })} />
  }

  if (route.name === "routine") {
    return <BotRoutineEditor bot={bot} client={client} routineId={route.id} onClose={openRoutines} />
  }

  return <ChatWorkspace bot={bot} client={client} />
}

/** The Bot's pages in edge-tab order. Choosing the current page returns to the conversation; on a Rotina, Rotinas returns to the list. */
function botRouteActions(bot: Pick<Bot, "leaderBotId" | "temporary">, route: BotRoute): BotRouteAction[] {
  function open(name: Exclude<BotRouteActionName, "chat">) {
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

  return [
    { name: "chat", label: "Conversa", icon: <ChatBubbleLeftIcon aria-hidden="true" />, current: route.name === "chat", select: () => openBotRoute({ name: "chat" }) },
    { name: "settings", label: "Configurações", icon: <Cog6ToothIcon aria-hidden="true" />, current: route.name === "settings", select: () => open("settings") },
    ...(bot.leaderBotId ? [] : [{ name: "members" as const, label: "Integrantes", icon: <UserGroupIcon aria-hidden="true" />, current: route.name === "members", select: () => open("members") }]),
    ...(bot.temporary ? [] : [
      { name: "routines" as const, label: "Rotinas", icon: <ClockIcon aria-hidden="true" />, current: route.name === "routines" || route.name === "routine", select: () => open("routines") },
      { name: "triggers" as const, label: "Gatilhos", icon: <BoltIcon aria-hidden="true" />, current: route.name === "triggers" || route.name === "trigger", select: () => open("triggers") },
    ]),
    { name: "memory", label: "Memórias", icon: <BrainIcon aria-hidden="true" />, current: route.name === "memory", select: () => open("memory") },
  ]
}

function browserSidebarLabel(hasBrowserPages: boolean, open: boolean) {
  if (!hasBrowserPages) {
    return "Nenhum navegador ativo"
  }

  if (open) {
    return "Recolher navegadores"
  }

  return "Mostrar navegadores"
}

function BotRouteTab({ bot, route }: { bot: Bot; route: BotRoute }) {
  const mobile = useIsMobile()
  const browserSidebarOpen = useSelector(botsStore, (state) => state.browserSidebarOpen)
  const hasBrowserPages = useSelector(browserStore, (state) => state.pages.length > 0)
  const browserNeedsHelp = useSelector(browserStore, (state) => state.pages.some((page) => page.control === "user" || !!page.error))

  return (
    <ChatEdgeTab>
      {botRouteActions(bot, route).map((action) => (
        <IconButton key={action.name} iconSize={16} current={action.current} type="button" label={`${action.label} de ${bot.name}`} tooltipPlacement="left" onClick={action.select}>{action.icon}</IconButton>
      ))}
      {mobile && <IconButton id="browser-sidebar-toggle-mobile" iconSize={16} current={browserSidebarOpen} type="button" disabled={!hasBrowserPages} label={browserSidebarLabel(hasBrowserPages, browserSidebarOpen)} aria-expanded={browserSidebarOpen} aria-controls="browser-sidebar" tooltipPlacement="left" onClick={toggleBrowserSidebar}>
        <ComputerDesktopIcon aria-hidden="true" />
        {browserNeedsHelp && <span className="absolute top-1 right-1 size-1.5 rounded-full bg-status-warning" aria-hidden="true" />}
      </IconButton>}
    </ChatEdgeTab>
  )
}
