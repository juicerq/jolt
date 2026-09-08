import { ChevronLeftIcon, ComputerDesktopIcon, UserGroupIcon } from "@heroicons/react/24/outline"
import { useQuery } from "@tanstack/react-query"
import { useSelector } from "@tanstack/react-store"
import type { ReactNode } from "react"
import type { Bot } from "@src/shared/bots"
import { chatStatusClassNames, chatStatusLabels } from "../chat/chat-status"
import { needsResponse, useConversationOverview } from "../chat/chat-overview"
import type { EngineClient } from "../engine-client"
import { IconButton } from "../ui/icon-button"
import { BotFace } from "./bot-face"
import { type BotRoute, botsStore, closeWorkspaceScreen, discardDraft, openBotRoute, selectBot, showBotList, toggleBrowserSidebar } from "./bots-store"
import { findTeamBot, teamOf } from "./team"

const routeTitles: Record<BotRoute["name"], string> = { chat: "Conversa", details: "Sobre o Bot", settings: "Configurações", members: "Integrantes", routines: "Rotinas", triggers: "Gatilhos", memory: "Memórias", routine: "Rotina", trigger: "Gatilho" }
const routeParents: Partial<Record<BotRoute["name"], BotRoute>> = { routine: { name: "routines" }, trigger: { name: "triggers" }, details: { name: "chat" } }
const screenTitles = { plugins: "Plugins", settings: "Configurações" }

export function WorkspaceTopBar({ client }: { client: EngineClient }) {
  const screen = useSelector(botsStore, (state) => state.screen)
  const draft = useSelector(botsStore, (state) => state.draft)
  const selectedBotId = useSelector(botsStore, (state) => state.selectedBotId)
  const route = useSelector(botsStore, (state) => state.botRoute)
  const { data: groups } = useQuery(client.query.projects.list.queryOptions())
  const bot = selectedBotId ? findTeamBot(groups, selectedBotId) : undefined

  if (screen) {
    return <TopBar back={{ label: "Voltar", onBack: closeWorkspaceScreen }}>{screenTitles[screen]}</TopBar>
  }

  if (draft) {
    return <TopBar back={{ label: "Voltar", onBack: discardDraft }}>Novo Bot</TopBar>
  }

  if (!bot) {
    return <TopBar back={{ label: "Bots", onBack: showBotList }}>Mimo</TopBar>
  }

  if (route.name !== "chat") {
    const parent = routeParents[route.name] ?? { name: "details" }

    return <TopBar back={{ label: "Voltar", onBack: () => openBotRoute(parent) }}>{routeTitles[route.name]}</TopBar>
  }

  const { leader, members } = teamOf(groups, bot)

  return <TopBar back={{ label: leader?.name ?? "Bots", onBack: () => leader ? selectBot(leader.id) : showBotList() }} action={members.length > 0 && <IconButton label={`Integrantes de ${bot.name}`} onClick={() => openBotRoute({ name: "members" })}><UserGroupIcon /></IconButton>}>
    <BotIdentity bot={bot} members={members} client={client} />
  </TopBar>
}

function TopBar({ back, children, action }: { back: { label: string; onBack: () => void }; children: ReactNode; action?: ReactNode }) {
  const browserOpen = useSelector(botsStore, (state) => state.browserSidebarOpen)

  return <header className="flex min-h-16 shrink-0 items-center gap-2 border-b border-outline bg-surface px-3 md:hidden">
    <button className="flex h-11 max-w-24 shrink-0 items-center gap-0.5 rounded-lg pr-1 text-support text-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring active:bg-surface-active" onClick={back.onBack} aria-label={back.label === "Voltar" ? "Voltar" : `Voltar para ${back.label}`}><ChevronLeftIcon className="size-4 shrink-0" /><span className="truncate">{back.label}</span></button>
    <div className="min-w-0 flex-1 text-section font-semibold">{children}</div>{action}
    <IconButton id="browser-sidebar-toggle-mobile" label="Mostrar navegadores" aria-expanded={browserOpen} aria-controls="browser-sidebar" onClick={toggleBrowserSidebar}><ComputerDesktopIcon /></IconButton>
  </header>
}

function BotIdentity({ bot, members, client }: { bot: Bot; members: Bot[]; client: EngineClient }) {
  const overview = useConversationOverview(client)
  const ownStatus = overview.status(bot.id)
  const teamPending = members.some((member) => !member.closed && needsResponse(overview.status(member.id)))
  const status = teamPending ? "awaiting-decision" : ownStatus
  const label = teamPending && !needsResponse(ownStatus) ? "Seu Time precisa de você" : chatStatusLabels[ownStatus]

  return <button className="flex min-h-11 w-full min-w-0 items-center gap-2 rounded-lg text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" onClick={() => openBotRoute({ name: "details" })} aria-label={`Sobre ${bot.name}`}>
    <span className="relative flex shrink-0"><BotFace className="size-8" name={bot.avatarSeed} botId={bot.id} size={32} /><span className={`absolute right-0 bottom-0 size-[7px] rounded-full ${chatStatusClassNames[status]}`} aria-hidden="true" /></span>
    <span className="flex min-w-0 flex-col"><strong className="truncate text-section font-semibold text-primary">{bot.name}</strong><small className="truncate text-metadata font-medium text-secondary">{label}</small></span>
  </button>
}
