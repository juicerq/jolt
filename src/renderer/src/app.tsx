import { useStore } from "@tanstack/react-store"
import { browserStore } from "./browser/browser-store"
import { MinusIcon, Square2StackIcon, XMarkIcon } from "@heroicons/react/24/outline"
import type { EngineClient } from "./engine-client"
import { BrowserPanel } from "./browser/browser-panel"
import { BotsWorkspace } from "./bots/bots-workspace"
import { IconButton } from "./ui/icon-button"

export function App({ client }: { client: EngineClient }) {
  const browserFocused = useStore(browserStore, (state) => state.focusedBotId !== null)

  return (
    <main className="relative m-0 grid h-screen min-h-0 w-screen max-w-none grid-rows-[minmax(0,1fr)] overflow-hidden bg-canvas p-0 font-sans text-control font-medium text-primary [--window-controls-clearance:140px] [color-scheme:dark]">
      <div className="contents" inert={browserFocused}>
        <WindowControls />
        <BotsWorkspace client={client} />
      </div>
      <BrowserPanel />
    </main>
  )
}

function WindowControls() {
  return (
    <>
      <div className="absolute inset-x-0 top-0 z-20 h-3 [-webkit-app-region:drag]" aria-hidden="true" />
      <div className="absolute top-5 right-5 z-30 flex items-center gap-0.5 [-webkit-app-region:no-drag] max-[720px]:top-4 max-[720px]:right-4">
        <IconButton className="opacity-35 hover:opacity-100 focus-visible:opacity-100" type="button" label="Minimizar janela" tooltipPlacement="bottom" onClick={() => window.desktop.minimizeWindow()}>
          <MinusIcon aria-hidden="true" />
        </IconButton>
        <IconButton className="opacity-35 hover:opacity-100 focus-visible:opacity-100" type="button" label="Maximizar ou restaurar janela" tooltipPlacement="bottom" onClick={() => window.desktop.toggleMaximizeWindow()}>
          <Square2StackIcon aria-hidden="true" />
        </IconButton>
        <IconButton className="opacity-35 hover:opacity-100 focus-visible:opacity-100" type="button" label="Fechar janela" tone="window-close" tooltipPlacement="bottom" onClick={() => window.desktop.closeWindow()}>
          <XMarkIcon aria-hidden="true" />
        </IconButton>
      </div>
    </>
  )
}
