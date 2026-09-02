import { ChevronDownIcon } from "@heroicons/react/24/outline"
import { useMutation } from "@tanstack/react-query"
import { useId } from "react"
import { botPermissionModes, type BotPermissionMode } from "../../../shared/bot-permissions"
import type { Bot } from "../../../shared/bots"
import type { PermissionRequest } from "../../../shared/permissions"
import { useUpdateBotExecution } from "../bots/bot-update"
import type { EngineClient } from "../engine-client"
import { Button } from "../ui/button"
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

const requestLabels: Record<string, string> = {
  bash: "Executar comando",
  delegate: "Delegar Tarefa",
  edit: "Editar arquivo",
  find: "Buscar arquivos fora da Pasta de trabalho",
  grep: "Pesquisar fora da Pasta de trabalho",
  hire: "Contratar Integrante",
  ls: "Listar fora da Pasta de trabalho",
  note: "Registrar Nota",
  read: "Ler fora da Pasta de trabalho",
  remove_routine: "Remover Rotina",
  routine: "Criar Rotina",
  transfer: "Transferir Tarefa",
  write: "Escrever arquivo",
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

export function ChatPermissionRequest({ botId, client, request, remaining }: { botId: string; client: EngineClient; request: PermissionRequest; remaining: number }) {
  const { mutate, isPending, error } = useMutation(client.query.permissions.decide.mutationOptions())
  const label = requestLabels[request.tool] ?? `Usar ${request.tool}`
  const detailClassName = request.tool === "bash"
    ? "mt-0.5 mb-0 max-h-32 overflow-auto whitespace-pre-wrap font-mono text-metadata text-secondary [overflow-wrap:anywhere]"
    : "mt-0.5 mb-0 max-h-32 overflow-auto whitespace-pre-wrap text-support text-secondary [overflow-wrap:anywhere]"

  function decide(decision: "allowed" | "denied") {
    mutate({ botId, requestId: request.id, decision })
  }

  return (
    <section className="order-first col-span-full mx-1 mb-1 flex min-w-0 items-center gap-3 rounded-xl border border-[color-mix(in_srgb,var(--color-status-awaiting-decision)_45%,transparent)] bg-[color-mix(in_srgb,var(--color-status-awaiting-decision)_8%,var(--color-surface-raised))] p-3 max-[620px]:flex-wrap" aria-label="Pedido de permissão">
      <div className="min-w-0 flex-1">
        <p className="m-0 text-control font-semibold text-primary">{label}</p>
        {request.detail && <p className={detailClassName}>{request.detail}</p>}
        {request.brief && <p className="mt-0.5 mb-0 max-h-20 overflow-auto whitespace-pre-wrap text-metadata text-muted [overflow-wrap:anywhere]">{request.brief}</p>}
        {remaining > 0 && <p className="mt-1 mb-0 text-metadata text-muted">Mais {remaining} {remaining === 1 ? "pedido pendente" : "pedidos pendentes"}</p>}
        {error && <p className="mt-1 mb-0 text-support text-status-error">Falha ao responder: {error.message}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="text" type="button" disabled={isPending} onClick={() => decide("denied")}>Negar</Button>
        <Button type="button" disabled={isPending} onClick={() => decide("allowed")}>{isPending ? "Respondendo..." : "Permitir"}</Button>
      </div>
    </section>
  )
}
