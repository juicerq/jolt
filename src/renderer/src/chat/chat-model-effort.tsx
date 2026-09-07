import { ArrowUturnLeftIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline"
import { type ReactNode, type ToggleEvent, useId, useState } from "react"
import { botEfforts } from "@src/shared/bot-efforts"
import type { Bot, BotEffort } from "@src/shared/bots"
import type { EngineClient } from "../engine-client"
import { useRefreshProviderModels } from "../settings/provider-mutations"
import { IconButton } from "../ui/icon-button"
import { MenuLabel, MenuOption, menuRowClassName } from "../ui/menu"
import { useIsMobile } from "../ui/use-is-mobile"
import { type BotExecutionUpdate, useUpdateBotExecution } from "./chat-bot-update"
import { chatControlAnchor, chatControlChipClassName, chatControlPopoverClassName, chatControlSubmenuClassName } from "./chat-control-menu"
import { ChatModelOptions, useBotModel } from "./chat-model-picker"

type Submenu = "model" | "effort"

const submenus: Submenu[] = ["model", "effort"]
const effortLabels: Record<BotEffort, string> = { low: "baixo", medium: "médio", high: "alto", xhigh: "muito alto", max: "máximo" }
const rowClassName = `${menuRowClassName} bg-transparent text-secondary hover:bg-surface-hover hover:text-primary aria-expanded:bg-surface-hover aria-expanded:text-primary`

/**
 * One chip reading `Modelo Esforço` that opens a menu with a row per setting. Each row opens its list as a
 * nested popover: beside the row on hover or click on desktop, as a sheet over the menu on mobile, where choosing
 * a Modelo moves straight to the Esforço sheet.
 */
export function ChatModelEffort({ bot, client, disabled }: { bot: Bot; client: EngineClient; disabled: boolean }) {
  const base = useId().replace(/[^a-zA-Z0-9-]/g, "")
  const menuId = `model-effort-${base}`
  const ids: Record<Submenu, string> = { model: `model-${base}`, effort: `effort-${base}` }
  const anchor = chatControlAnchor(menuId)
  const mobile = useIsMobile()
  const [open, setOpen] = useState<Submenu | null>(null)
  const [opening, setOpening] = useState(0)
  const execution = useUpdateBotExecution(bot, client)
  const { mutate: refreshModels } = useRefreshProviderModels(client)
  const { currentModel, currentModelId, defaultModelId } = useBotModel(bot, client)
  const modelName = currentModel?.name ?? currentModelId ?? "Modelo"
  const standard = bot.effort === "medium" && currentModelId === defaultModelId

  function show(submenu: Submenu | null) {
    for (const key of submenus) {
      document.getElementById(ids[key])?.togglePopover(key === submenu)
    }
  }

  /** Desktop opens a submenu on hover; a sheet sliding under a resting pointer must not. */
  function hover(submenu: Submenu | null) {
    if (!mobile) {
      show(submenu)
    }
  }

  function closeMenu() {
    document.getElementById(menuId)?.togglePopover(false)
  }

  function handleSubmenuToggle(submenu: Submenu, event: ToggleEvent<HTMLDivElement>) {
    if (event.newState === "open") {
      setOpen(submenu)
      setOpening((count) => count + 1)

      if (submenu === "model") {
        refreshModels({})
      }

      return
    }

    setOpen((current) => (current === submenu ? null : current))
  }

  function reset() {
    if (defaultModelId && currentModelId !== defaultModelId) {
      execution.update({ setting: "model", value: { provider: bot.provider, model: defaultModelId } })
    }

    if (bot.effort !== "medium") {
      execution.update({ setting: "effort", value: "medium" })
    }

    closeMenu()
  }

  return (
    <>
      <button className={`${chatControlChipClassName} min-w-0 [&>svg]:shrink-0`} type="button" disabled={disabled || execution.isPending} popoverTarget={menuId} aria-label={`Modelo e Esforço: ${modelName}, ${effortLabels[bot.effort]}`} style={anchor.trigger}>
        <span className="min-w-0 truncate"><span className="text-secondary">{modelName}</span> <span className="first-letter:uppercase">{effortLabels[bot.effort]}</span></span>
        <ChevronDownIcon aria-hidden="true" />
      </button>
      <div className={`${chatControlPopoverClassName} w-60`} id={menuId} popover="auto" style={anchor.popover} aria-label="Modelo e Esforço">
        <ChatControlRow label="Modelo" value={modelName} submenuId={ids.model} expanded={open === "model"} onHover={() => hover("model")} />
        <div className={`${chatControlSubmenuClassName} w-64`} id={ids.model} popover="auto" style={chatControlAnchor(ids.model).popover} aria-label="Modelo" onToggle={(event) => handleSubmenuToggle("model", event)}>
          <ChatSubmenuTitle submenuId={ids.model}>Modelo</ChatSubmenuTitle>
          <ChatModelOptions key={opening} bot={bot} client={client} execution={execution} autoFocusSearch={!mobile} onChoose={() => (mobile ? show("effort") : closeMenu())} />
        </div>
        <ChatControlRow label="Esforço" value={effortLabels[bot.effort]} submenuId={ids.effort} expanded={open === "effort"} onHover={() => hover("effort")} />
        <div className={chatControlSubmenuClassName} id={ids.effort} popover="auto" style={chatControlAnchor(ids.effort).popover} aria-label="Esforço" onToggle={(event) => handleSubmenuToggle("effort", event)}>
          <ChatSubmenuTitle submenuId={ids.effort}>Esforço</ChatSubmenuTitle>
          <ChatEffortOptions bot={bot} execution={execution} onChoose={closeMenu} />
        </div>
        <hr className="my-1.5 h-px border-0 bg-outline" />
        <button className={rowClassName} type="button" disabled={standard || execution.isPending} onMouseEnter={() => hover(null)} onClick={reset}>
          <span>Redefinir para o padrão</span>
          <ArrowUturnLeftIcon className="ml-auto size-3.5 shrink-0 text-muted" aria-hidden="true" />
        </button>
      </div>
    </>
  )
}

function ChatControlRow({ label, value, submenuId, expanded, onHover }: { label: string; value: string; submenuId: string; expanded: boolean; onHover: () => void }) {
  return (
    <button className={rowClassName} type="button" popoverTarget={submenuId} popoverTargetAction="show" aria-haspopup="menu" aria-expanded={expanded} style={chatControlAnchor(submenuId).trigger} onMouseEnter={onHover}>
      <span className="shrink-0">{label}</span>
      <span className="ml-auto min-w-0 truncate text-metadata font-normal text-muted first-letter:uppercase">{value}</span>
      <ChevronRightIcon className="size-3.5 shrink-0 text-muted" aria-hidden="true" />
    </button>
  )
}

/** The submenu label; on mobile it gains the back action that returns to the menu sheet. */
function ChatSubmenuTitle({ submenuId, children }: { submenuId: string; children: ReactNode }) {
  return (
    <div className="flex items-center">
      <IconButton className="md:hidden" iconSize={16} size={32} type="button" label="Voltar" popoverTarget={submenuId} popoverTargetAction="hide"><ChevronLeftIcon aria-hidden="true" /></IconButton>
      <MenuLabel className="max-md:text-control max-md:font-semibold max-md:text-primary">{children}</MenuLabel>
    </div>
  )
}

function ChatEffortOptions({ bot, execution, onChoose }: { bot: Pick<Bot, "effort">; execution: BotExecutionUpdate; onChoose?: () => void }) {
  function handleChoose(effort: BotEffort) {
    if (effort !== bot.effort) {
      execution.update({ setting: "effort", value: effort })
    }

    onChoose?.()
  }

  return (
    <div className="flex flex-col">
      {botEfforts.map((effort) => <MenuOption key={effort} label={effortLabels[effort]} selected={effort === bot.effort} standard={effort === "medium"} disabled={execution.isPending} onSelect={() => handleChoose(effort)} />)}
    </div>
  )
}
