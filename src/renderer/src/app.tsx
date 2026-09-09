import { useStore } from "@tanstack/react-store"
import { browserStore } from "./browser/browser-store"
import { ComputerDesktopIcon, MinusIcon, Square2StackIcon, XMarkIcon } from "@heroicons/react/24/outline"
import type { EngineClient } from "./engine-client"
import { type BrowserActions, BrowserPanel } from "./browser/browser-panel"
import { botsStore, closeBrowserSidebar, toggleBrowserSidebar } from "./bots/bots-store"
import { BotsWorkspace } from "./bots/bots-workspace"
import { useIsMobile } from "./ui/use-is-mobile"
import { useViewportHeight } from "./ui/use-viewport-height"
import { IconButton } from "./ui/icon-button"

export function App({ browser, client }: { browser: BrowserActions; client: EngineClient }) {
  const mobile = useIsMobile()
  const viewportHeight = useViewportHeight()
  const browserFocused = useStore(browserStore, (state) => state.focusedBotId !== null)
  const browserNeedsHelp = useStore(browserStore, (state) => state.pages.some((page) => (page.control === "user" && !!page.reason) || !!page.error))
  const sidebarOpen = useStore(botsStore, (state) => state.browserSidebarOpen)
  const frameless = !window.desktop.remote
  const clearance = frameless ? "[--window-controls-clearance:140px] max-md:[--window-controls-clearance:120px]" : "[--window-controls-clearance:0px]"

  function closeSidebar() {
    closeBrowserSidebar()
    const mobileToggle = document.getElementById("browser-sidebar-toggle-mobile")
    const toggle = mobileToggle?.getClientRects().length ? mobileToggle : document.getElementById("browser-sidebar-toggle")

    toggle?.focus()
  }

  return (
    <main style={mobile ? { height: viewportHeight } : undefined} className={`relative m-0 flex h-dvh min-h-0 w-full max-w-none overflow-hidden bg-canvas p-0 font-sans text-control font-medium text-primary [color-scheme:dark] ${clearance} md:max-[96rem]:[--window-controls-clearance:180px]`}>
      <div className="min-h-0 min-w-0 flex-1" inert={browserFocused}>
        {frameless && <WindowControls />}
        <div className={`absolute top-6 z-30 [-webkit-app-region:no-drag] min-[96rem]:hidden max-md:hidden ${frameless ? "right-32" : "right-6"}`}>
          <IconButton id="browser-sidebar-toggle" type="button" label={sidebarOpen ? "Recolher navegadores" : "Mostrar navegadores"} tone={sidebarOpen ? "raised" : "ghost"} tooltipPlacement="bottom" aria-expanded={sidebarOpen} aria-controls="browser-sidebar" onClick={toggleBrowserSidebar}>
            <ComputerDesktopIcon aria-hidden="true" />
            {browserNeedsHelp && <span className="absolute top-1 right-1 size-1.5 rounded-full bg-status-warning" aria-hidden="true" />}
          </IconButton>
          {browserNeedsHelp && <span className="sr-only" role="status">Um navegador precisa da sua atenção.</span>}
        </div>
        <BotsWorkspace client={client} />
      </div>
      <BrowserPanel browser={browser} sidebarOpen={sidebarOpen} onCloseSidebar={closeSidebar} />
    </main>
  )
}

function WindowControls() {
  return (
    <>
      <div className="absolute inset-x-0 top-0 z-20 h-3 [-webkit-app-region:drag]" aria-hidden="true" />
      <div className="absolute top-6 right-6 z-30 flex items-center gap-0.5 [-webkit-app-region:no-drag] max-md:top-[calc(19px+var(--safe-top))] max-md:right-4">
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
