import { useQuery } from "@tanstack/react-query"
import { type KeyboardEvent, useEffect, useId, useState } from "react"
import type { Bot } from "@src/shared/bots"
import type { ProviderModels, ProviderName } from "@src/shared/providers"
import type { BotExecutionUpdate } from "../bots/bot-update"
import type { EngineClient } from "../engine-client"
import { useRefreshProviderModels } from "../settings/provider-mutations"
import { MenuLabel, MenuOption } from "../ui/menu"

const searchThreshold = 8
const searchClassName = "mb-1.5 w-full rounded-none border-0 border-b border-outline bg-transparent px-2 pt-0.5 pb-2 text-control font-medium text-primary placeholder:font-normal placeholder:text-muted focus-visible:outline-none max-md:text-base"

function matching(catalogs: ProviderModels[], query: string) {
  const term = query.trim().toLowerCase()

  if (!term) {
    return catalogs
  }

  return catalogs
    .map((catalog) => ({ ...catalog, models: catalog.models.filter((model) => model.name.toLowerCase().includes(term)) }))
    .filter((catalog) => catalog.models.length > 0)
}

export function useBotModel(bot: Pick<Bot, "provider" | "model">, client: EngineClient) {
  const { data } = useQuery({ ...client.query.providers.models.queryOptions(), staleTime: Infinity })
  const catalogs = data ?? []
  const catalog = catalogs.find((entry) => entry.provider === bot.provider)
  const currentModelId = bot.model ?? catalog?.default

  return { catalogs, currentModelId, defaultModelId: catalog?.default, currentModel: catalog?.models.find((model) => model.id === currentModelId) }
}

interface ChatModelOptionsProps {
  bot: Bot
  client: EngineClient
  execution: BotExecutionUpdate
  autoFocusSearch?: boolean
  /** Runs after any choice, including the current one, once its popover has closed. */
  onChoose?: () => void
}

/** The Fornecedor catalogs with a search above the threshold. Mounting it refreshes the catalogs; remount it to reset the search. */
export function ChatModelOptions({ bot, client, execution, autoFocusSearch = false, onChoose }: ChatModelOptionsProps) {
  const id = useId()
  const [query, setQuery] = useState("")
  const { catalogs, currentModelId } = useBotModel(bot, client)
  const { mutate: refreshModels } = useRefreshProviderModels(client)
  const groups = matching(catalogs, query)
  const total = catalogs.reduce((count, entry) => count + entry.models.length, 0)

  useEffect(() => refreshModels({}), [refreshModels])

  function handleChoose(provider: ProviderName, model: string) {
    if (provider !== bot.provider || model !== currentModelId) {
      execution.update({ setting: "model", value: { provider, model } })
    }

    onChoose?.()
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
      {total > searchThreshold && (
        <input
          className={searchClassName}
          type="text"
          autoComplete="off"
          autoFocus={autoFocusSearch}
          placeholder="Buscar Modelo"
          aria-label="Buscar Modelo"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleSearchKeyDown}
        />
      )}
      <div className="max-h-64 overflow-y-auto max-md:max-h-none">
        {groups.length === 0 && <p className="m-0 px-2 py-1.5 text-support text-secondary">{total === 0 ? "Nenhum modelo disponível. Confira suas Inscrições nas Configurações." : "Nenhum modelo encontrado."}</p>}
        {groups.map((group) => (
          <div key={group.provider} role="group" aria-labelledby={`${id}-${group.provider}`}>
            <MenuLabel id={`${id}-${group.provider}`}>{group.name}</MenuLabel>
            {group.models.map((model) => (
              <MenuOption
                key={`${group.provider}-${model.id}`}
                label={model.name}
                selected={group.provider === bot.provider && model.id === currentModelId}
                standard={model.id === group.default}
                disabled={execution.isPending}
                onSelect={() => handleChoose(group.provider, model.id)}
              />
            ))}
          </div>
        ))}
      </div>
    </>
  )
}
