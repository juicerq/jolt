import { ArrowTurnDownLeftIcon } from "@heroicons/react/24/outline"
import { useMutation } from "@tanstack/react-query"
import { useEffect } from "react"
import type { PermissionRequest } from "@src/shared/permissions"
import type { EngineClient } from "../engine-client"
import { Button } from "../ui/button"
import { permissionPresentation } from "./permission-presentation"

const typingTags = new Set(["INPUT", "TEXTAREA", "SELECT", "BUTTON"])

function focusSection(section: HTMLElement | null) {
  section?.scrollIntoView({ block: "nearest" })
  section?.focus({ preventScroll: true })
}

export function ChatPermissionRequest({ botId, client, request, remaining }: { botId: string; client: EngineClient; request: PermissionRequest; remaining: number }) {
  const { mutate, isPending, error } = useMutation(client.query.permissions.decide.mutationOptions())
  const presentation = permissionPresentation(request)

  function decide(decision: "allowed" | "denied") {
    mutate({ botId, requestId: request.id, decision })
  }

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
    <section ref={focusSection} className="grid min-w-0 gap-3 outline-none" aria-label="Pedido de permissão" tabIndex={-1}>
      <div className="grid min-w-0 gap-1.5">
        <strong className="text-control font-semibold text-primary">{presentation.title}</strong>
        {presentation.description && <p className="m-0 max-h-40 overflow-auto whitespace-pre-wrap break-words text-support text-secondary">{presentation.description}</p>}
        {error && <p className="m-0 text-support text-status-error">Falha ao responder: {error.message}</p>}
      </div>
      <div className="flex items-center gap-2">
        {remaining > 0 && <p className="m-0 text-metadata text-muted">Mais {remaining} {remaining === 1 ? "pedido pendente" : "pedidos pendentes"}</p>}
        <Button className="ml-auto" variant="text" type="button" disabled={isPending} onClick={() => decide("denied")}>{presentation.deny}</Button>
        <Button className="inline-flex items-center gap-1.5" type="button" disabled={isPending} onClick={() => decide("allowed")}>
          {isPending ? "Respondendo…" : presentation.allow}
          {!isPending && <ArrowTurnDownLeftIcon className="size-3 stroke-2" aria-hidden="true" />}
        </Button>
      </div>
    </section>
  )
}
