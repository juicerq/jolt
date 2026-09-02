import { ChevronDownIcon } from "@heroicons/react/24/outline"
import { useQuery } from "@tanstack/react-query"
import { useId } from "react"
import { botEfforts } from "../../../shared/bot-efforts"
import type { Bot, BotEffort } from "../../../shared/bots"
import { effortLabels } from "../bots/bot-effort"
import { useUpdateBotExecution } from "../bots/bot-update"
import type { EngineClient } from "../engine-client"
import { MenuDivider, MenuLabel, MenuOption } from "../ui/menu"
import { chatControlAnchor, chatControlChipClassName, chatControlPopoverClassName } from "./chat-control-menu"

export function ChatModelEffort({ bot, client, disabled }: { bot: Bot; client: EngineClient; disabled: boolean }) {
  const id = useId()
  const popoverId = `model-effort-${id.replace(/[^a-zA-Z0-9-]/g, "")}`
  const anchor = chatControlAnchor(popoverId)
  const { data: providerModels } = useQuery({ ...client.query.providers.models.queryOptions(), staleTime: Infinity })
  const catalog = providerModels?.find((entry) => entry.provider === bot.provider)
  const currentModelId = bot.model ?? catalog?.default
  const currentModel = catalog?.models.find((model) => model.id === currentModelId)
  const label = [currentModel?.name ?? currentModelId, effortLabels[bot.effort]].filter(Boolean).join(" · ")
  const { update, isPending } = useUpdateBotExecution(bot, client)

  function handleChooseModel(model: string) {
    if (model === currentModelId) {
      return
    }

    update({ setting: "model", value: model })
  }

  function handleChooseEffort(effort: BotEffort) {
    if (effort === bot.effort) {
      return
    }

    update({ setting: "effort", value: effort })
  }

  return (
    <>
      <button className={chatControlChipClassName} type="button" disabled={disabled || isPending} popoverTarget={popoverId} style={anchor.trigger}>
        {label}
        <ChevronDownIcon aria-hidden="true" />
      </button>
      <div className={chatControlPopoverClassName} id={popoverId} popover="auto" style={anchor.popover}>
        <MenuLabel id={`${popoverId}-model`}>Modelo</MenuLabel>
        {catalog?.models.length === 0
          ? <p className="m-0 px-2 py-1.5 text-support text-secondary">Nenhum modelo disponível no Fornecedor.</p>
          : (
            <div className="flex flex-col" role="group" aria-labelledby={`${popoverId}-model`}>
              {catalog?.models.map((model) => <MenuOption key={model.id} label={model.name} selected={model.id === currentModelId} standard={model.id === catalog.default} disabled={isPending} onSelect={() => handleChooseModel(model.id)} />)}
            </div>
          )}
        <MenuDivider />
        <MenuLabel id={`${popoverId}-effort`}>Esforço</MenuLabel>
        <div className="flex flex-col" role="group" aria-labelledby={`${popoverId}-effort`}>
          {botEfforts.map((effort) => <MenuOption key={effort} label={effortLabels[effort]} selected={effort === bot.effort} standard={effort === "medium"} disabled={isPending} onSelect={() => handleChooseEffort(effort)} />)}
        </div>
      </div>
    </>
  )
}
