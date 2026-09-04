import { ChevronDownIcon } from "@heroicons/react/24/outline"
import { useQuery } from "@tanstack/react-query"
import { type KeyboardEvent, type ToggleEvent, useId, useRef, useState } from "react"
import type { Bot } from "../../../shared/bots"
import type { ProviderModels, ProviderName } from "../../../shared/providers"
import { useUpdateBotExecution } from "../bots/bot-update"
import type { EngineClient } from "../engine-client"
import { MenuLabel, MenuOption } from "../ui/menu"
import { chatControlAnchor, chatControlChipClassName, chatControlPopoverClassName } from "./chat-control-menu"

const searchThreshold = 8
const searchClassName = "mb-1.5 w-full rounded-none border-0 border-b border-outline bg-transparent px-2 pt-0.5 pb-2 text-control font-medium text-primary placeholder:font-normal placeholder:text-muted focus-visible:outline-none"

function matching(catalogs: ProviderModels[], query: string) {
  const term = query.trim().toLowerCase()

  if (!term) {
    return catalogs
  }

  return catalogs
    .map((catalog) => ({ ...catalog, models: catalog.models.filter((model) => model.name.toLowerCase().includes(term)) }))
    .filter((catalog) => catalog.models.length > 0)
}

export function ChatModelPicker({ bot, client, disabled }: { bot: Bot; client: EngineClient; disabled: boolean }) {
  const popoverId = `model-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`
  const anchor = chatControlAnchor(popoverId)
  const searchRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState("")
  const { data } = useQuery({ ...client.query.providers.models.queryOptions(), staleTime: Infinity })
  const catalogs = data ?? []
  const catalog = catalogs.find((entry) => entry.provider === bot.provider)
  const currentModelId = bot.model ?? catalog?.default
  const currentModel = catalog?.models.find((model) => model.id === currentModelId)
  const { update, isPending } = useUpdateBotExecution(bot, client)
  const groups = matching(catalogs, query)
  const total = catalogs.reduce((count, entry) => count + entry.models.length, 0)

  function handleChoose(provider: ProviderName, model: string) {
    if (provider === bot.provider && model === currentModelId) {
      return
    }

    update({ setting: "model", value: { provider, model } })
  }

  function handleToggle(event: ToggleEvent<HTMLDivElement>) {
    setQuery("")

    if (event.newState === "open") {
      searchRef.current?.focus()
    }
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") {
      return
    }

    const group = groups.at(0)
    const model = group?.models.at(0)

    if (!group || !model) {
      return
    }

    event.currentTarget.closest<HTMLElement>("[popover]")?.hidePopover()
    handleChoose(group.provider, model.id)
  }

  return (
    <>
      <button className={chatControlChipClassName} type="button" disabled={disabled || isPending} popoverTarget={popoverId} style={anchor.trigger}>
        {currentModel?.name ?? currentModelId ?? "Modelo"}
        <ChevronDownIcon aria-hidden="true" />
      </button>
      <div className={`${chatControlPopoverClassName} flex w-64 flex-col`} id={popoverId} popover="auto" style={anchor.popover} onToggle={handleToggle}>
        {total > searchThreshold && (
          <input
            ref={searchRef}
            className={searchClassName}
            type="text"
            autoComplete="off"
            placeholder="Buscar Modelo"
            aria-label="Buscar Modelo"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleSearchKeyDown}
          />
        )}
        <div className="flex max-h-64 min-h-0 flex-col overflow-y-auto">
          {groups.length === 0 && <p className="m-0 px-2 py-1.5 text-support text-secondary">{total === 0 ? "Nenhum Fornecedor conectado." : "Nenhum Modelo com esse nome."}</p>}
          {groups.map((group) => (
            <div key={group.provider} role="group" aria-labelledby={`${popoverId}-${group.provider}`}>
              <MenuLabel id={`${popoverId}-${group.provider}`}>{group.name}</MenuLabel>
              {group.models.map((model) => (
                <MenuOption
                  key={`${group.provider}-${model.id}`}
                  label={model.name}
                  selected={group.provider === bot.provider && model.id === currentModelId}
                  standard={model.id === group.default}
                  disabled={isPending}
                  onSelect={() => handleChoose(group.provider, model.id)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
