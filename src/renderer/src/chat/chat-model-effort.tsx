import { ChevronDownIcon } from "@heroicons/react/24/outline"
import { useQuery } from "@tanstack/react-query"
import { useId } from "react"
import { botEfforts } from "../../../shared/bot-efforts"
import type { Bot, BotEffort } from "../../../shared/bots"
import { effortLabels } from "../bots/bot-effort"
import { useUpdateBotExecution } from "../bots/bot-update"
import type { EngineClient } from "../engine-client"
import { MenuLabel, MenuOption } from "../ui/menu"
import { chatControlAnchor, chatControlChipClassName, chatControlPopoverClassName } from "./chat-control-menu"

export function ChatModelEffort({ bot, client, disabled }: { bot: Bot; client: EngineClient; disabled: boolean }) {
  const id = useId()
  const controlId = id.replace(/[^a-zA-Z0-9-]/g, "")
  const modelPopoverId = `model-${controlId}`
  const effortPopoverId = `effort-${controlId}`
  const modelAnchor = chatControlAnchor(modelPopoverId)
  const effortAnchor = chatControlAnchor(effortPopoverId)
  const { data: providerModels } = useQuery({ ...client.query.providers.models.queryOptions(), staleTime: Infinity })
  const catalog = providerModels?.find((entry) => entry.provider === bot.provider)
  const currentModelId = bot.model ?? catalog?.default
  const currentModel = catalog?.models.find((model) => model.id === currentModelId)
  const modelLabel = currentModel?.name ?? currentModelId
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
    <div className="flex items-center gap-1">
      <button className={chatControlChipClassName} type="button" disabled={disabled || isPending} popoverTarget={modelPopoverId} style={modelAnchor.trigger}>
        {modelLabel}
        <ChevronDownIcon aria-hidden="true" />
      </button>
      <div className={chatControlPopoverClassName} id={modelPopoverId} popover="auto" style={modelAnchor.popover}>
        <MenuLabel id={`${modelPopoverId}-label`}>Modelo</MenuLabel>
        {catalog?.models.length === 0
          ? <p className="m-0 px-2 py-1.5 text-support text-secondary">Nenhum modelo disponível no Fornecedor.</p>
          : (
            <div className="flex flex-col" role="group" aria-labelledby={`${modelPopoverId}-label`}>
              {catalog?.models.map((model) => <MenuOption key={model.id} label={model.name} selected={model.id === currentModelId} standard={model.id === catalog.default} disabled={isPending} onSelect={() => handleChooseModel(model.id)} />)}
            </div>
          )}
      </div>
      <button className={chatControlChipClassName} type="button" disabled={disabled || isPending} popoverTarget={effortPopoverId} style={effortAnchor.trigger}>
        <span className="first-letter:uppercase">{effortLabels[bot.effort]}</span>
        <ChevronDownIcon aria-hidden="true" />
      </button>
      <div className={chatControlPopoverClassName} id={effortPopoverId} popover="auto" style={effortAnchor.popover}>
        <MenuLabel id={`${effortPopoverId}-label`}>Esforço</MenuLabel>
        <div className="flex flex-col" role="group" aria-labelledby={`${effortPopoverId}-label`}>
          {botEfforts.map((effort) => <MenuOption key={effort} label={effortLabels[effort]} selected={effort === bot.effort} standard={effort === "medium"} disabled={isPending} onSelect={() => handleChooseEffort(effort)} />)}
        </div>
      </div>
    </div>
  )
}
