import { ArrowTurnDownLeftIcon } from "@heroicons/react/24/outline"
import { useMutation } from "@tanstack/react-query"
import { useEffect, useRef } from "react"
import type { PermissionRequest } from "../../../shared/permissions"
import type { EngineClient } from "../engine-client"
import { Button } from "../ui/button"

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

const typingTags = new Set(["INPUT", "TEXTAREA", "SELECT", "BUTTON"])

export function ChatPermissionRequest({ botId, client, request, remaining }: { botId: string; client: EngineClient; request: PermissionRequest; remaining: number }) {
  const sectionRef = useRef<HTMLElement | null>(null)
  const { mutate, isPending, error } = useMutation(client.query.permissions.decide.mutationOptions())
  const label = requestLabels[request.tool] ?? request.label ?? `Usar ${request.tool}`
  const details = Object.entries(request.arguments ?? {}).filter(([, value]) => value !== undefined && value !== "")

  function decide(decision: "allowed" | "denied") {
    mutate({ botId, requestId: request.id, decision })
  }

  useEffect(() => {
    sectionRef.current?.scrollIntoView({ block: "nearest" })
    sectionRef.current?.focus({ preventScroll: true })
  }, [request.id])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const typing = event.target instanceof HTMLElement && typingTags.has(event.target.tagName)

      if (event.key !== "Enter" || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || typing || isPending) {
        return
      }

      event.preventDefault()
      decide("allowed")
    }

    window.addEventListener("keydown", handleKeyDown)

    return () => window.removeEventListener("keydown", handleKeyDown)
  })

  return (
    <section ref={sectionRef} className="mt-3.5 grid w-[min(600px,calc(100vw-380px))] gap-3 rounded-xl border border-[color-mix(in_srgb,var(--color-status-awaiting-decision)_45%,transparent)] bg-[color-mix(in_srgb,var(--color-status-awaiting-decision)_8%,var(--color-surface-raised))] p-3 outline-none" aria-label="Pedido de permissão" tabIndex={-1}>
      <div className="grid min-w-0 gap-1.5">
        <strong className="text-control font-semibold text-primary">{label}</strong>
        {request.tool === "bash" ? <PermissionCommand request={request} /> : <PermissionDetails request={request} details={details} />}
        {error && <p className="m-0 text-support text-status-error">Falha ao responder: {error.message}</p>}
      </div>
      <div className="flex items-center gap-2">
        {remaining > 0 && <p className="m-0 text-metadata text-muted">Mais {remaining} {remaining === 1 ? "pedido pendente" : "pedidos pendentes"}</p>}
        <Button className="ml-auto" variant="text" type="button" disabled={isPending} onClick={() => decide("denied")}>Negar</Button>
        <Button className="inline-flex items-center gap-1.5" type="button" disabled={isPending} onClick={() => decide("allowed")}>
          {isPending ? "Respondendo..." : "Permitir"}
          {!isPending && <ArrowTurnDownLeftIcon className="size-3 stroke-2" aria-hidden="true" />}
        </Button>
      </div>
    </section>
  )
}

function PermissionCommand({ request }: { request: PermissionRequest }) {
  return (
    <div className="grid min-w-0 gap-1 rounded-lg bg-surface px-2.5 py-2">
      {request.cwd && <span className="font-mono text-metadata text-muted [overflow-wrap:anywhere]">{request.cwd}</span>}
      <pre className="m-0 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-support text-secondary [overflow-wrap:anywhere]">{request.detail}</pre>
    </div>
  )
}

function PermissionDetails({ request, details }: { request: PermissionRequest; details: [string, unknown][] }) {
  return (
    <>
      {request.detail && <p className="m-0 max-h-32 overflow-auto whitespace-pre-wrap text-support text-secondary [overflow-wrap:anywhere]">{request.detail}</p>}
      {request.brief && <p className="m-0 max-h-20 overflow-auto whitespace-pre-wrap text-metadata text-muted [overflow-wrap:anywhere]">{request.brief}</p>}
      {details.length > 0 && (
        <dl className="m-0 grid max-h-32 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 overflow-auto text-support">
          {details.map(([name, value]) => <PermissionArgument key={name} name={name} value={value} />)}
        </dl>
      )}
    </>
  )
}

function PermissionArgument({ name, value }: { name: string; value: unknown }) {
  const text = typeof value === "string" ? value : JSON.stringify(value)

  return (
    <>
      <dt className="m-0 text-metadata font-medium text-muted">{name}</dt>
      <dd className="m-0 whitespace-pre-wrap text-secondary [overflow-wrap:anywhere]">{text}</dd>
    </>
  )
}
