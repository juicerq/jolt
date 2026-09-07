import { ChevronDoubleRightIcon, ChevronLeftIcon } from "@heroicons/react/24/outline"
import { useQuery } from "@tanstack/react-query"
import { useSelector } from "@tanstack/react-store"
import type { ReactNode } from "react"
import type { Bot } from "@src/shared/bots"
import { chatStatusClassNames, chatStatusLabels } from "../chat/chat-status"
import { chatStore } from "../chat/chat-store"
import type { EngineClient } from "../engine-client"
import { IconButton } from "../ui/icon-button"
import { BotFace } from "./bot-face"
import { type BotRoute, botsStore, closeWorkspaceScreen, discardDraft, openBotRoute, showRail } from "./bots-store"
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

/** Mobile title bar for the conversation plane. Hidden on desktop, where the sidebar and the edge tab do this job; the edge tab also owns the Bot's pages on mobile. */
export function WorkspaceTopBar({ client }: { client: EngineClient }) {
  const screen = useSelector(botsStore, (state) => state.screen)
  const draft = useSelector(botsStore, (state) => state.draft)
  const selectedBotId = useSelector(botsStore, (state) => state.selectedBotId)
  const route = useSelector(botsStore, (state) => state.botRoute)
  const { data: groups } = useQuery(client.query.projects.list.queryOptions())
  const bot = selectedBotId ? findTeamBot(groups, selectedBotId) : undefined

  if (screen) {
    return <TopBar back={{ label: `Fechar ${screenTitles[screen]}`, onBack: closeWorkspaceScreen }}><TopBarTitle>{screenTitles[screen]}</TopBarTitle></TopBar>
  }

  if (draft) {
    return <TopBar back={{ label: "Descartar criação", onBack: discardDraft }}><TopBarTitle>Novo Bot</TopBarTitle></TopBar>
  }

  if (!bot) {
    return <TopBar><TopBarTitle>Mimo</TopBarTitle></TopBar>
  }

  if (route.name === "chat") {
    return <TopBar><BotIdentity bot={bot} /></TopBar>
  }

  const parent = routeParents[route.name] ?? { name: "chat" }

  return (
    <TopBar back={{ label: `Voltar para ${routeTitles[parent.name]}`, onBack: () => openBotRoute(parent) }}>
      <TopBarTitle>{routeTitles[route.name]}</TopBarTitle>
    </TopBar>
  )
}

function TopBar({ back, children }: { back?: { label: string; onBack: () => void }; children: ReactNode }) {
  const railHidden = useSelector(botsStore, (state) => state.railHidden)

  return (
    <header className={`flex min-h-[52px] shrink-0 items-center gap-1 border-b border-outline bg-surface pr-[max(8px,var(--window-controls-clearance))] md:hidden ${back || railHidden ? "pl-1.5" : "pl-3.5"}`}>
      {railHidden && <IconButton size={34} type="button" label="Mostrar a barra lateral" onClick={showRail}><ChevronDoubleRightIcon aria-hidden="true" /></IconButton>}
      {back && <IconButton size={34} type="button" label={back.label} onClick={back.onBack}><ChevronLeftIcon aria-hidden="true" /></IconButton>}
      <div className="min-w-0 flex-1">{children}</div>
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

