import { MinusIcon, Square2StackIcon, XMarkIcon } from "@heroicons/react/24/outline"
import type { EngineClient } from "./engine-client"
import { BotsWorkspace } from "./bots/bots-workspace"

export function App({ client }: { client: EngineClient }) {
  return (
    <main className="relative m-0 grid h-screen min-h-0 w-screen max-w-none grid-rows-[minmax(0,1fr)] overflow-hidden bg-canvas p-0 font-sans text-control font-medium text-primary [color-scheme:dark]">
      <WindowControls />
      <BotsWorkspace client={client} />
    </main>
  )
}

function WindowControls() {
  return (
    <div className="absolute top-0 left-0 z-2 box-border flex h-13 w-[286px] min-w-0 items-center justify-start px-2.5 py-2 [-webkit-app-region:drag]">
      <div className="flex items-center gap-0.5 [-webkit-app-region:no-drag]">
        <button
          className="grid size-8 cursor-pointer place-items-center rounded-lg border-0 bg-transparent p-0 text-muted hover:bg-surface-hover hover:text-primary focus-visible:bg-surface-hover focus-visible:text-primary focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset focus-visible:outline-none active:bg-surface-active"
          type="button"
          aria-label="Minimizar janela"
          onClick={() => window.desktop.minimizeWindow()}
        >
          <MinusIcon className="size-3.5 fill-none stroke-[1.25] [stroke-linecap:round] [stroke-linejoin:round]" aria-hidden="true" />
        </button>
        <button
          className="grid size-8 cursor-pointer place-items-center rounded-lg border-0 bg-transparent p-0 text-muted hover:bg-surface-hover hover:text-primary focus-visible:bg-surface-hover focus-visible:text-primary focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset focus-visible:outline-none active:bg-surface-active"
          type="button"
          aria-label="Maximizar ou restaurar janela"
          onClick={() => window.desktop.toggleMaximizeWindow()}
        >
          <Square2StackIcon className="size-3.5 fill-none stroke-[1.25] [stroke-linecap:round] [stroke-linejoin:round]" aria-hidden="true" />
        </button>
        <button
          className="grid size-8 cursor-pointer place-items-center rounded-lg border-0 bg-transparent p-0 text-muted hover:bg-[color-mix(in_oklch,var(--color-status-error)_70%,var(--color-surface))] hover:text-primary focus-visible:bg-[color-mix(in_oklch,var(--color-status-error)_70%,var(--color-surface))] focus-visible:text-primary focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset focus-visible:outline-none active:bg-surface-active"
          type="button"
          aria-label="Fechar janela"
          onClick={() => window.desktop.closeWindow()}
        >
          <XMarkIcon className="size-3.5 fill-none stroke-[1.25] [stroke-linecap:round] [stroke-linejoin:round]" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
