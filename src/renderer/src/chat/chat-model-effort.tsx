import { ChevronDownIcon } from "@heroicons/react/24/outline"
import { useId } from "react"
import { botEfforts } from "@src/shared/bot-efforts"
import type { Bot, BotEffort } from "@src/shared/bots"
import { effortLabels } from "../bots/bot-effort"
import { type BotExecutionUpdate, useUpdateBotExecution } from "../bots/bot-update"
import type { EngineClient } from "../engine-client"
import { MenuLabel, MenuOption } from "../ui/menu"
import { chatControlAnchor, chatControlChipClassName, chatControlPopoverClassName } from "./chat-control-menu"
import { ChatModelPicker } from "./chat-model-picker"

export function ChatModelEffort({ bot, client, disabled }: { bot: Bot; client: EngineClient; disabled: boolean }) {
  const effortPopoverId = `effort-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`
  const effortAnchor = chatControlAnchor(effortPopoverId)
  const execution = useUpdateBotExecution(bot, client)

  return (
    <div className="flex items-center gap-1">
      <ChatModelPicker bot={bot} client={client} execution={execution} disabled={disabled} />
      <button className={chatControlChipClassName} type="button" disabled={disabled || execution.isPending} popoverTarget={effortPopoverId} style={effortAnchor.trigger}>
        <span className="first-letter:uppercase">{effortLabels[bot.effort]}</span>
        <ChevronDownIcon aria-hidden="true" />
      </button>
      <div className={chatControlPopoverClassName} id={effortPopoverId} popover="auto" style={effortAnchor.popover}>
        <ChatEffortOptions bot={bot} execution={execution} />
      </div>
    </div>
  )
}

export function ChatEffortOptions({ bot, execution }: { bot: Pick<Bot, "effort">; execution: BotExecutionUpdate }) {
  const labelId = useId()

  function handleChoose(effort: BotEffort) {
    if (effort === bot.effort) {
      return
    }

    execution.update({ setting: "effort", value: effort })
  }

  return (
    <>
      <MenuLabel id={labelId}>Esforço</MenuLabel>
      <div className="flex flex-col" role="group" aria-labelledby={labelId}>
        {botEfforts.map((effort) => <MenuOption key={effort} label={effortLabels[effort]} selected={effort === bot.effort} standard={effort === "medium"} disabled={execution.isPending} onSelect={() => handleChoose(effort)} />)}
      </div>
    </>
  )
}
