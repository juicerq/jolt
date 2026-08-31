import { MinusIcon, Square2StackIcon, XMarkIcon } from "@heroicons/react/24/outline"
import type { EngineClient } from "./engine-client"
import { BotsWorkspace } from "./bots/bots-workspace"
import { IconButton } from "./ui/icon-button"

export function App({ client }: { client: EngineClient }) {
  return (
    <main className="jots-app">
      <WindowControls />
      <BotsWorkspace client={client} />
    </main>
  )
}

function WindowControls() {
  return (
    <div className="window-titlebar" hidden>
      <div className="window-controls">
        <IconButton type="button" label="Minimizar janela" onClick={() => window.desktop.minimizeWindow()}>
          <MinusIcon aria-hidden="true" />
        </IconButton>
        <IconButton type="button" label="Maximizar ou restaurar janela" onClick={() => window.desktop.toggleMaximizeWindow()}>
          <Square2StackIcon aria-hidden="true" />
        </IconButton>
        <IconButton className="window-close-button" type="button" label="Fechar janela" onClick={() => window.desktop.closeWindow()}>
          <XMarkIcon aria-hidden="true" />
        </IconButton>
      </div>
    </div>
  )
}
