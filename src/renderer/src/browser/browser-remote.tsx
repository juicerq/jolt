import { useCallback, useState } from "react"
import type { BrowserPreview } from "@src/shared/browser"
import type { EngineClient } from "../engine-client"
import { Button } from "../ui/button"
import type { BrowserActions } from "./browser-panel"
import { focusBrowser } from "./browser-store"

const retryDelayMs = 1_000
const requestTimeoutMs = 5_000

type ConnectionStatus = "loading" | "live" | "offline"

function delay(signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve()
      return
    }

    const finish = () => {
      clearTimeout(timer)
      signal.removeEventListener("abort", finish)
      resolve()
    }
    const timer = setTimeout(finish, retryDelayMs)
    signal.addEventListener("abort", finish, { once: true })
  })
}

export function createRemoteBrowser(client: Pick<EngineClient, "raw">): BrowserActions {
  async function streamFrames({ botId, img, signal, onStatus }: { botId: string; img: HTMLImageElement; signal: AbortSignal; onStatus: (status: ConnectionStatus) => void }) {
    let after = 0

    while (!signal.aborted) {
      try {
        const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(requestTimeoutMs)])
        const frame = await client.raw.browser.frame({ botId, after }, { signal: requestSignal })

        if (signal.aborted) {
          return
        }

        if (frame) {
          after = frame.seq
          img.src = `data:image/jpeg;base64,${frame.image}`
        }

        onStatus(after ? "live" : "loading")
      } catch {
        if (signal.aborted) {
          return
        }

        onStatus("offline")
        await delay(signal)
      }
    }
  }

  function Viewport({ page }: { page: BrowserPreview }) {
    const [zoomed, setZoomed] = useState(false)
    const [hasFrame, setHasFrame] = useState(false)
    const [status, setStatus] = useState<ConnectionStatus>("loading")
    const attachImage = useCallback((img: HTMLImageElement | null) => {
      if (!img) {
        return
      }

      const controller = new AbortController()

      void streamFrames({ botId: page.botId, img, signal: controller.signal, onStatus: setStatus })

      return () => controller.abort()
    }, [page.botId])

    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="relative min-h-0 flex-1 bg-canvas">
          <div className="size-full overflow-auto overscroll-contain focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" tabIndex={0} role="region" aria-label="Imagem do navegador">
            <div className={zoomed ? "min-h-full w-max min-w-full" : "flex h-full items-center justify-center"}>
              <img ref={attachImage} onLoad={() => setHasFrame(true)} alt={`Página aberta em ${page.botName}`} draggable={false} className={zoomed ? "block max-w-none select-none" : "block max-h-full max-w-full select-none object-contain"} />
            </div>
          </div>
          {status === "loading" && <p className="pointer-events-none absolute inset-0 m-0 grid place-items-center text-support text-secondary" role="status">Carregando a página…</p>}
          {status === "offline" && <p className="pointer-events-none absolute inset-x-3 top-3 m-0 rounded-lg bg-surface-raised p-3 text-support text-secondary" role="status">Reconectando…{hasFrame && " A imagem pode estar desatualizada."}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
          <p className="m-0 text-support text-secondary">{zoomed ? "Deslize para ver os detalhes da imagem." : "Acompanhando a página no computador."}</p>
          <Button variant="secondary" disabled={!hasFrame} aria-pressed={zoomed} onClick={() => setZoomed(!zoomed)}>{zoomed ? "Ajustar à tela" : "Ampliar imagem"}</Button>
        </div>
      </div>
    )
  }

  return {
    Viewport,
    watch: async (botId) => focusBrowser(botId),
    minimize: async () => focusBrowser(null),
  }
}
