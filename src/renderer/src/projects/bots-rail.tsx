import { ArrowPathIcon, ChevronDoubleLeftIcon, Cog6ToothIcon, MagnifyingGlassIcon, PuzzlePieceIcon } from "@heroicons/react/24/outline"
import { useQuery } from "@tanstack/react-query"
import { useSelector } from "@tanstack/react-store"
import { type MouseEvent, useId, useRef, useState } from "react"
import type { Bot } from "@src/shared/bots"
import { BotFace } from "../bots/bot-face"
import { botsStore, hideRail, openPlugins, openSettings, selectBot } from "../bots/bots-store"
import { teamLeaders } from "../bots/team"
import { chatStatusClassNames, chatStatusLabels } from "../chat/chat-status"
import { chatStore, type ChatStatus } from "../chat/chat-store"
import type { EngineClient } from "../engine-client"
import { appUpdateStore } from "../settings/app-update-store"
import { IconButton } from "../ui/icon-button"
import { menuCardClassName } from "../ui/menu"
import { Tooltip, useTooltip } from "../ui/tooltip"
import { BotSearch, CreateMenu, SidebarProjects } from "./projects-sidebar"

/** Mobile only: the compact Bot column beside the conversation plane. Desktop shows the ProjectsSidebar. */
export function BotsRail({ client }: { client: EngineClient }) {
  const draftOpen = useSelector(botsStore, (state) => state.draft !== null)
  const pluginsOpen = useSelector(botsStore, (state) => state.screen === "plugins")
  const settingsOpen = useSelector(botsStore, (state) => state.screen === "settings")
  const selectedBotId = useSelector(botsStore, (state) => (state.draft === null && state.screen === null ? state.selectedBotId : null))
  const statuses = useSelector(chatStore, (state) => state.statuses)
  const updateReady = useSelector(appUpdateStore, (state) => state.updateReady)
  const { data } = useQuery(client.query.projects.list.queryOptions())

  return (
    <aside className="flex min-h-0 flex-col items-center gap-1 bg-sidebar py-2 md:hidden" aria-label="Bots">
      <IconButton size={34} type="button" label="Esconder a barra lateral" tooltipPlacement="right" onClick={hideRail}><ChevronDoubleLeftIcon aria-hidden="true" /></IconButton>
      <RailSearch client={client} draftOpen={draftOpen} />
      <ul className="m-0 flex min-h-0 flex-1 list-none flex-col items-center gap-1 overflow-y-auto p-0 py-1" aria-label="Bots">
        {teamLeaders(data).map((bot) => (
          <RailBot key={bot.id} bot={bot} selected={selectedBotId === bot.id || bot.members.some((member) => member.id === selectedBotId)} status={statuses[bot.id] ?? "available"} />
        ))}
      </ul>
      {updateReady && <IconButton size={34} tone="primary" type="button" label="Atualizar e reiniciar" tooltipPlacement="right" onClick={() => window.desktop.installUpdate()}><ArrowPathIcon aria-hidden="true" /></IconButton>}
      <CreateMenu draftOpen={draftOpen} size={34} />
      <IconButton className={pluginsOpen ? "bg-surface-active text-primary" : ""} size={34} type="button" label="Plugins" aria-pressed={pluginsOpen} tooltipPlacement="right" onClick={openPlugins}><PuzzlePieceIcon aria-hidden="true" /></IconButton>
      <IconButton className={settingsOpen ? "bg-surface-active text-primary" : ""} size={34} type="button" label="Configurações" aria-pressed={settingsOpen} tooltipPlacement="right" onClick={openSettings}><Cog6ToothIcon aria-hidden="true" /></IconButton>
    </aside>
  )
}

function RailBot({ bot, selected, status }: { bot: Bot; selected: boolean; status: ChatStatus }) {
  const tooltip = useTooltip()

  return (
    <li className="block">
      <button
        {...tooltip.anchorProps}
        className={`grid size-12 place-items-center rounded-xl border p-0 transition-colors duration-150 focus-visible:border-focus focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none active:bg-surface-active ${selected ? "border-outline bg-surface-raised" : "border-transparent bg-transparent"}`}
        type="button"
        aria-label={`${bot.name}: ${chatStatusLabels[status]}`}
        aria-current={selected ? "true" : undefined}
        onClick={() => selectBot(bot.id)}
      >
        <span className="relative flex">
          <BotFace className="size-[38px]" name={bot.avatarSeed} botId={bot.id} size={38} />
          <span className={`absolute right-0.5 bottom-0.5 size-[7px] rounded-full ${chatStatusClassNames[status]}`} aria-hidden="true" />
        </span>
      </button>
      <Tooltip {...tooltip.popoverProps} placement="right">{bot.name}</Tooltip>
    </li>
  )
}

/** The full list as a sheet: the search sits at the bottom, next to the keyboard, and the list grows upward from it. */
function RailSearch({ client, draftOpen }: { client: EngineClient; draftOpen: boolean }) {
  const popoverId = `bot-search-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`
  const inputRef = useRef<HTMLInputElement>(null)
  const [search, setSearch] = useState("")

  function closeOnChoice(event: MouseEvent<HTMLDivElement>) {
    const button = (event.target as HTMLElement).closest("button")

    if (button && !button.hasAttribute("aria-expanded")) {
      event.currentTarget.hidePopover()
    }
  }

  return (
    <>
      <IconButton size={34} type="button" label="Buscar Bots" tooltipPlacement="right" popoverTarget={popoverId}><MagnifyingGlassIcon aria-hidden="true" /></IconButton>
      <div className={`${menuCardClassName} chat-control-popover flex flex-col`} id={popoverId} popover="auto" aria-label="Buscar Bots" onClick={closeOnChoice} onToggle={(event) => event.newState === "open" && inputRef.current?.focus()}>
        <SidebarProjects client={client} search={search} draftOpen={draftOpen} />
        <div className="flex shrink-0 pt-2"><BotSearch ref={inputRef} value={search} onChange={setSearch} /></div>
      </div>
    </>
  )
}
