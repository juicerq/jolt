import { ChevronDownIcon } from "@heroicons/react/24/outline"
import { useId } from "react"
import { botPermissionModes, type BotPermissionMode } from "@src/shared/bot-permissions"
import type { Bot } from "@src/shared/bots"
import { type BotExecutionUpdate, useUpdateBotExecution } from "../bots/bot-update"
import type { EngineClient } from "../engine-client"
import { MenuLabel, MenuOption } from "../ui/menu"
import { chatControlAnchor, chatControlChipClassName, chatControlPopoverClassName } from "./chat-control-menu"

export const permissionModeLabels: Record<BotPermissionMode, string> = {
  "read-only": "Somente leitura",
  ask: "Perguntar",
  full: "Acesso total",
}

const modeDetails: Record<BotPermissionMode, string> = {
  "read-only": "Bloqueia ações",
  ask: "Pede antes de agir",
  full: "Age sem pedir",
}

export function ChatPermission({ bot, client, disabled }: { bot: Bot; client: EngineClient; disabled: boolean }) {
  const popoverId = `permission-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`
  const anchor = chatControlAnchor(popoverId)
  const execution = useUpdateBotExecution(bot, client)

  return (
    <>
      <button className={chatControlChipClassName} type="button" disabled={disabled || execution.isPending} popoverTarget={popoverId} style={anchor.trigger}>
        {permissionModeLabels[bot.permissionMode]}
        <ChevronDownIcon aria-hidden="true" />
      </button>
      <div className={chatControlPopoverClassName} id={popoverId} popover="auto" style={anchor.popover}>
        <ChatPermissionOptions bot={bot} execution={execution} />
      </div>
    </>
  )
}

export function ChatPermissionOptions({ bot, execution }: { bot: Pick<Bot, "permissionMode">; execution: BotExecutionUpdate }) {
  const labelId = useId()

  function handleChoose(permissionMode: BotPermissionMode) {
    if (permissionMode === bot.permissionMode) {
      return
    }

    execution.update({ setting: "permissionMode", value: permissionMode })
  }

  return (
    <>
      <MenuLabel id={labelId}>Permissões</MenuLabel>
      <div className="flex flex-col" role="group" aria-labelledby={labelId}>
        {botPermissionModes.map((mode) => <MenuOption key={mode} label={permissionModeLabels[mode]} detail={modeDetails[mode]} selected={mode === bot.permissionMode} standard={mode === "ask"} disabled={execution.isPending} onSelect={() => handleChoose(mode)} />)}
      </div>
    </>
  )
}
