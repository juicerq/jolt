import { ChevronDownIcon } from "@heroicons/react/24/outline"
import { useId } from "react"
import { botPermissionModes, type BotPermissionMode } from "@src/shared/bot-permissions"
import type { Bot } from "@src/shared/bots"
import { useUpdateBotExecution } from "../bots/bot-update"
import type { EngineClient } from "../engine-client"
import { MenuLabel, MenuOption } from "../ui/menu"
import { chatControlAnchor, chatControlChipClassName, chatControlPopoverClassName } from "./chat-control-menu"

const modeLabels: Record<BotPermissionMode, string> = {
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
  const id = useId()
  const popoverId = `permission-${id.replace(/[^a-zA-Z0-9-]/g, "")}`
  const anchor = chatControlAnchor(popoverId)
  const { update, isPending } = useUpdateBotExecution(bot, client)

  function handleChoose(permissionMode: BotPermissionMode) {
    if (permissionMode === bot.permissionMode) {
      return
    }

    update({ setting: "permissionMode", value: permissionMode })
  }

  return (
    <>
      <button className={chatControlChipClassName} type="button" disabled={disabled || isPending} popoverTarget={popoverId} style={anchor.trigger}>
        {modeLabels[bot.permissionMode]}
        <ChevronDownIcon aria-hidden="true" />
      </button>
      <div className={chatControlPopoverClassName} id={popoverId} popover="auto" style={anchor.popover}>
        <MenuLabel id={`${popoverId}-label`}>Permissões</MenuLabel>
        <div className="flex flex-col" role="group" aria-labelledby={`${popoverId}-label`}>
          {botPermissionModes.map((mode) => <MenuOption key={mode} label={modeLabels[mode]} detail={modeDetails[mode]} selected={mode === bot.permissionMode} standard={mode === "ask"} disabled={isPending} onSelect={() => handleChoose(mode)} />)}
        </div>
      </div>
    </>
  )
}
