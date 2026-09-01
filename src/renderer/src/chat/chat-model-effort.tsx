import { ChevronDownIcon } from "@heroicons/react/24/outline"
import { useQuery } from "@tanstack/react-query"
import { type CSSProperties, useId } from "react"
import { type Bot, type BotEffort, botEfforts } from "../../../shared/bots"
import { effortLabels } from "../bots/bot-effort"
import { useUpdateBot } from "../bots/bot-update"
import type { EngineClient } from "../engine-client"
import { MenuDivider, MenuLabel, MenuOption, menuCardClassName } from "../ui/menu"

const chipClassName = "flex h-[26px] shrink-0 items-center gap-1 rounded-md border-0 bg-transparent px-2 text-metadata font-medium whitespace-nowrap text-muted transition-colors duration-150 hover:bg-surface-hover hover:text-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-default disabled:opacity-40 motion-reduce:transition-none [&>svg]:size-3 [&>svg]:stroke-2"
const popoverClassName = `${menuCardClassName} inset-auto mb-2 transition-[opacity,transform,display,overlay] transition-discrete duration-120 ease-out [position-area:top_span-left] [position-try-fallbacks:flip-block,flip-inline] starting:translate-y-0.5 starting:opacity-0 motion-reduce:transition-none`

export function ChatModelEffort({ bot, client, disabled }: { bot: Bot; client: EngineClient; disabled: boolean }) {
  const id = useId()
  const popoverId = `model-effort-${id.replace(/[^a-zA-Z0-9-]/g, "")}`
  const anchorName = `--${popoverId}`
  const { data: providerModels } = useQuery(client.query.providers.models.queryOptions())
  const catalog = providerModels?.find((entry) => entry.provider === bot.provider)
  const currentModelId = bot.model ?? catalog?.default
  const currentModel = catalog?.models.find((model) => model.id === currentModelId)
  const label = [currentModel?.name ?? currentModelId, effortLabels[bot.effort]].filter(Boolean).join(" · ")
  const { update, isPending } = useUpdateBot(bot, client)

  function handleChooseModel(model: string) {
    if (model === currentModelId) {
      return
    }

    update({ model })
  }

  function handleChooseEffort(effort: BotEffort) {
    if (effort === bot.effort) {
      return
    }

    update({ effort })
  }

  return (
    <>
      <button className={chipClassName} type="button" disabled={disabled || isPending} popoverTarget={popoverId} style={{ anchorName } satisfies CSSProperties}>
        {label}
        <ChevronDownIcon aria-hidden="true" />
      </button>
      <div className={popoverClassName} id={popoverId} popover="auto" style={{ positionAnchor: anchorName }}>
        <MenuLabel id={`${popoverId}-model`}>Modelo</MenuLabel>
        {catalog?.models.length === 0
          ? <p className="m-0 px-2 py-1.5 text-support text-secondary">Nenhum modelo disponível no Fornecedor.</p>
          : (
            <div className="flex flex-col" role="group" aria-labelledby={`${popoverId}-model`}>
              {catalog?.models.map((model) => <MenuOption key={model.id} label={model.name} selected={model.id === currentModelId} standard={model.id === catalog.default} onSelect={() => handleChooseModel(model.id)} />)}
            </div>
          )}
        <MenuDivider />
        <MenuLabel id={`${popoverId}-effort`}>Esforço</MenuLabel>
        <div className="flex flex-col" role="group" aria-labelledby={`${popoverId}-effort`}>
          {botEfforts.map((effort) => <MenuOption key={effort} label={effortLabels[effort]} selected={effort === bot.effort} standard={effort === "medium"} onSelect={() => handleChooseEffort(effort)} />)}
        </div>
      </div>
    </>
  )
}
