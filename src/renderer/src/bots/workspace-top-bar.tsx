import { ChevronLeftIcon, EllipsisHorizontalIcon } from "@heroicons/react/24/outline"
import { useQuery } from "@tanstack/react-query"
import { useSelector } from "@tanstack/react-store"
import { type ReactNode, useId } from "react"
import type { Bot } from "@src/shared/bots"
import { chatControlPopoverClassName } from "../chat/chat-control-menu"
import { chatStatusClassNames, chatStatusLabels } from "../chat/chat-status"
import { chatStore } from "../chat/chat-store"
import type { EngineClient } from "../engine-client"
import { IconButton } from "../ui/icon-button"
import { MenuLabel, MenuOption } from "../ui/menu"
import { botRouteActions } from "./bot-chat"
import { BotFace } from "./bot-face"
import { type BotRoute, botsStore, closeWorkspaceScreen, discardDraft, openBotList, openBotRoute } from "./bots-store"
import { findTeamBot } from "./team"

const routeTitles: Record<BotRoute["name"], string> = {
  chat: "Conversa",
  settings: "Configurações",
  members: "Integrantes",
  routines: "Rotinas",
  triggers: "Gatilhos",
  memory: "Memórias",
  routine: "Rotina",
  trigger: "Gatilho",
}

const routeParents: Partial<Record<BotRoute["name"], BotRoute>> = { routine: { name: "routines" }, trigger: { name: "triggers" } }

const screenTitles = { plugins: "Plugins", settings: "Configurações" }

/** Mobile navigation for the conversation plane. Hidden on desktop, where the sidebar and the edge tab do this job. */
export function WorkspaceTopBar({ client }: { client: EngineClient }) {
  const screen = useSelector(botsStore, (state) => state.screen)
  const draft = useSelector(botsStore, (state) => state.draft)
  const selectedBotId = useSelector(botsStore, (state) => state.selectedBotId)
  const route = useSelector(botsStore, (state) => state.botRoute)
  const { data: groups } = useQuery(client.query.projects.list.queryOptions())
  const bot = selectedBotId ? findTeamBot(groups, selectedBotId) : undefined

  if (screen) {
    return <TopBar back="Voltar aos Bots" onBack={closeWorkspaceScreen}><TopBarTitle>{screenTitles[screen]}</TopBarTitle></TopBar>
  }

  if (draft) {
    return <TopBar back="Descartar criação" onBack={discardDraft}><TopBarTitle>Novo Bot</TopBarTitle></TopBar>
  }

  if (!bot) {
    return <TopBar back="Voltar aos Bots" onBack={openBotList}><TopBarTitle>Jolt</TopBarTitle></TopBar>
  }

  if (route.name === "chat") {
    return <TopBar back="Voltar aos Bots" onBack={openBotList} actions={<BotActionsMenu bot={bot} route={route} />}><BotIdentity bot={bot} /></TopBar>
  }

  const parent = routeParents[route.name] ?? { name: "chat" }

  return (
    <TopBar back={`Voltar para ${routeTitles[parent.name]}`} onBack={() => openBotRoute(parent)} actions={<BotActionsMenu bot={bot} route={route} />}>
      <TopBarTitle>{routeTitles[route.name]}</TopBarTitle>
    </TopBar>
  )
}

function TopBar({ back, onBack, actions, children }: { back: string; onBack: () => void; actions?: ReactNode; children: ReactNode }) {
  return (
    <header className="flex min-h-[52px] shrink-0 items-center gap-1 border-b border-outline bg-surface pt-[var(--safe-top)] pr-[max(8px,var(--window-controls-clearance))] pl-1.5 md:hidden">
      <IconButton size={34} type="button" label={back} onClick={onBack}><ChevronLeftIcon aria-hidden="true" /></IconButton>
      <div className="min-w-0 flex-1">{children}</div>
      {actions}
    </header>
  )
}

function TopBarTitle({ children }: { children: string }) {
  return <h1 className="m-0 truncate text-section font-semibold text-primary">{children}</h1>
}

function BotIdentity({ bot }: { bot: Bot }) {
  const status = useSelector(chatStore, (state) => state.statuses[bot.id] ?? "available")

  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="relative flex shrink-0">
        <BotFace className="size-8" name={bot.avatarSeed} botId={bot.id} size={32} />
        <span className={`absolute right-0 bottom-0 size-[7px] rounded-full ${chatStatusClassNames[status]}`} aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-col">
        <strong className="truncate text-control font-semibold text-primary">{bot.name}</strong>
        <small className="truncate text-metadata font-medium text-muted">{chatStatusLabels[status]}</small>
      </span>
    </div>
  )
}

function BotActionsMenu({ bot, route }: { bot: Bot; route: BotRoute }) {
  const popoverId = `bot-actions-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`

  return (
    <>
      <IconButton size={34} type="button" label={`Ações de ${bot.name}`} popoverTarget={popoverId}><EllipsisHorizontalIcon aria-hidden="true" /></IconButton>
      <div className={chatControlPopoverClassName} id={popoverId} popover="auto" aria-label={`Ações de ${bot.name}`}>
        <MenuLabel>{bot.name}</MenuLabel>
        {botRouteActions(bot, route).map((action) => (
          <MenuOption key={action.name} icon={<span className="shrink-0 text-muted [&>svg]:size-4" aria-hidden="true">{action.icon}</span>} label={action.label} selected={action.current} onSelect={action.select} />
        ))}
      </div>
    </>
  )
}
