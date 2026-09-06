import { ChevronDownIcon } from "@heroicons/react/24/outline"
import { useId } from "react"
import type { Bot } from "@src/shared/bots"
import { effortLabels } from "../bots/bot-effort"
import { useUpdateBotExecution } from "../bots/bot-update"
import type { EngineClient } from "../engine-client"
import { chatControlChipClassName, chatControlPopoverClassName } from "./chat-control-menu"
import { ChatEffortOptions } from "./chat-model-effort"
import { ChatModelOptions, useBotModel } from "./chat-model-picker"
import { ChatPermissionOptions, permissionModeLabels } from "./chat-permission"

/** Mobile: one chip summarizing Modelo, Esforço and Permissões; the sheet holds the three lists. */
export function ChatControlsSheet({ bot, client, disabled }: { bot: Bot; client: EngineClient; disabled: boolean }) {
  const popoverId = `controls-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`
  const execution = useUpdateBotExecution(bot, client)
  const { currentModel, currentModelId } = useBotModel(bot, client)
  const summary = [currentModel?.name ?? currentModelId ?? "Modelo", effortLabels[bot.effort], permissionModeLabels[bot.permissionMode]].join(" · ")

  return (
    <>
      <button className={`${chatControlChipClassName} min-w-0 [&>svg]:shrink-0`} type="button" disabled={disabled || execution.isPending} popoverTarget={popoverId} aria-label={`Modelo, Esforço e Permissões: ${summary}`}>
        <span className="min-w-0 truncate">{summary}</span>
        <ChevronDownIcon aria-hidden="true" />
      </button>
      <div className={chatControlPopoverClassName} id={popoverId} popover="auto" aria-label="Modelo, Esforço e Permissões">
        <ChatModelOptions bot={bot} client={client} execution={execution} />
        <hr className="my-2 h-px border-0 bg-outline" />
        <ChatEffortOptions bot={bot} execution={execution} />
        <hr className="my-2 h-px border-0 bg-outline" />
        <ChatPermissionOptions bot={bot} execution={execution} />
      </div>
    </>
  )
}
