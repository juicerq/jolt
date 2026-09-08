import { Store, useSelector } from "@tanstack/react-store"
import { ArrowPathIcon } from "@heroicons/react/24/outline"

export const connectionStore = new Store({ connected: false })

export function ConnectionBanner() {
  const connected = useSelector(connectionStore, (state) => state.connected)

  if (connected) {
    return null
  }

  return <div className="flex shrink-0 items-center gap-2 border-b border-outline bg-surface-raised px-4 py-3 text-support text-secondary" role="status"><ArrowPathIcon className="size-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" /><span>Reconectando ao computador. Seu rascunho continua aqui.</span></div>
}
