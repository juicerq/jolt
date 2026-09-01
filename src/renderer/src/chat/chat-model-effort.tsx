import { ChevronDownIcon } from "@heroicons/react/24/outline"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { type CSSProperties, useId } from "react"
import { type Bot, type BotEffort, botEfforts } from "../../../shared/bots"
import type { EngineClient } from "../engine-client"

export const effortLabels: Record<BotEffort, string> = { low: "baixo", medium: "médio", high: "alto", xhigh: "muito alto", max: "máximo" }

const chipClassName = "flex h-[26px] shrink-0 items-center gap-1 rounded-md border-0 bg-transparent px-2 text-metadata font-medium whitespace-nowrap text-muted transition-colors duration-150 hover:bg-surface-hover hover:text-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-default disabled:opacity-40 motion-reduce:transition-none [&>svg]:size-3 [&>svg]:stroke-2"
const popoverClassName = "inset-auto m-0 mb-2 w-max min-w-52 rounded-xl border border-outline bg-surface-raised p-1.5 text-primary shadow-[0_2px_6px_rgb(0_0_0/28%),0_12px_32px_rgb(0_0_0/32%)] transition-[opacity,transform,display,overlay] transition-discrete duration-120 ease-out [position-area:top_span-left] [position-try-fallbacks:flip-block,flip-inline] starting:translate-y-0.5 starting:opacity-0 motion-reduce:transition-none"
const sectionLabelClassName = "m-0 px-2 pt-1 pb-1 text-metadata font-medium text-muted"

export function ChatModelEffort({ bot, client, disabled }: { bot: Bot; client: EngineClient; disabled: boolean }) {
  const queryClient = useQueryClient()
  const id = useId()
  const popoverId = `model-effort-${id.replace(/[^a-zA-Z0-9-]/g, "")}`
  const anchorName = `--${popoverId}`
  const { data: providerModels } = useQuery(client.query.providers.models.queryOptions())
  const catalog = providerModels?.find((entry) => entry.provider === bot.provider)
  const currentModelId = bot.model ?? catalog?.default
  const currentModel = catalog?.models.find((model) => model.id === currentModelId)
  const label = [currentModel?.name ?? currentModelId, effortLabels[bot.effort]].filter(Boolean).join(" · ")
  const { mutate: update, isPending } = useMutation(client.query.bots.update.mutationOptions({
    onSuccess(updated) {
      queryClient.invalidateQueries({ queryKey: client.query.bots.get.queryOptions({ input: { id: updated.id } }).queryKey })
      queryClient.invalidateQueries({ queryKey: client.query.bots.list.queryOptions().queryKey })
      queryClient.invalidateQueries({ queryKey: client.query.projects.list.queryOptions().queryKey })
    },
  }))

  function save(changes: Partial<Pick<Bot, "effort" | "model">>) {
    update({ id: bot.id, name: bot.name, function: bot.function, projectId: bot.projectId, workingDirectoryOverride: bot.workingDirectoryOverride, memoryEnabled: bot.memoryEnabled, effort: bot.effort, model: bot.model, ...changes })
  }

  function handleChooseModel(model: string) {
    if (model === currentModelId) {
      return
    }

    save({ model })
  }

  function handleChooseEffort(effort: BotEffort) {
    if (effort === bot.effort) {
      return
    }

    save({ effort })
  }

  return (
    <>
      <button className={chipClassName} type="button" disabled={disabled || isPending} popoverTarget={popoverId} style={{ anchorName } satisfies CSSProperties}>
        {label}
        <ChevronDownIcon aria-hidden="true" />
      </button>
      <div className={popoverClassName} id={popoverId} popover="auto" style={{ positionAnchor: anchorName }}>
        <p className={sectionLabelClassName} id={`${popoverId}-model`}>Modelo</p>
        {catalog?.models.length === 0
          ? <p className="m-0 px-2 py-1.5 text-support text-secondary">Nenhum modelo disponível no Fornecedor.</p>
          : (
            <div className="flex flex-col" role="group" aria-labelledby={`${popoverId}-model`}>
              {catalog?.models.map((model) => <MenuOption key={model.id} label={model.name} selected={model.id === currentModelId} standard={model.id === catalog.default} onSelect={() => handleChooseModel(model.id)} />)}
            </div>
          )}
        <hr className="my-1.5 border-0 border-t border-outline" />
        <p className={sectionLabelClassName} id={`${popoverId}-effort`}>Esforço</p>
        <div className="flex flex-col" role="group" aria-labelledby={`${popoverId}-effort`}>
          {botEfforts.map((effort) => <MenuOption key={effort} label={effortLabels[effort]} selected={effort === bot.effort} standard={effort === "medium"} onSelect={() => handleChooseEffort(effort)} />)}
        </div>
      </div>
    </>
  )
}

function MenuOption({ label, selected, standard, onSelect }: { label: string; selected: boolean; standard: boolean; onSelect(): void }) {
  return (
    <button className={`flex w-full items-center gap-2 rounded-lg border-0 px-2 py-1.5 text-left text-control font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring motion-reduce:transition-none ${selected ? "bg-surface-active text-primary" : "bg-transparent text-secondary hover:bg-surface-hover hover:text-primary"}`} type="button" aria-pressed={selected} onClick={onSelect}>
      <span className="first-letter:uppercase">{label}</span>
      {standard && <span className="rounded-md bg-surface-hover px-1.5 py-px text-metadata font-medium text-muted">Padrão</span>}
    </button>
  )
}
