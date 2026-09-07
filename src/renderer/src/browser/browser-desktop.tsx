import { useCallback } from "react"
import type { BrowserPreview } from "@src/shared/browser"
import type { BrowserActions } from "./browser-panel"

function Viewport({ page }: { page: BrowserPreview }) {
  const attach = useCallback((element: HTMLDivElement | null) => {
    if (!element) {
      return
    }

    const update = () => {
      const bounds = element.getBoundingClientRect()

      void window.desktop.setBrowserBounds({ x: Math.round(bounds.x), y: Math.round(bounds.y), width: Math.floor(bounds.width), height: Math.floor(bounds.height) }).catch((error: unknown) => {
        console.error("Não foi possível posicionar o navegador", error)
      })
    }
    const observer = new ResizeObserver(update)
    observer.observe(element)
    update()

    return () => observer.disconnect()
  }, [page.botId, page.control])

  return <div ref={attach} className="min-h-0 flex-1 bg-canvas" />
}

export function createDesktopBrowser(): BrowserActions {
  return {
    Viewport,
    watch: window.desktop.watchBrowser,
    minimize: window.desktop.minimizeBrowser,
    control: {
      close: window.desktop.closeBrowser,
      closePopup: window.desktop.closeBrowserPopup,
      resume: window.desktop.resumeBrowser,
      takeControl: window.desktop.takeBrowserControl,
    },
  }
}
