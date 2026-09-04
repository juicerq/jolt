import { useStore } from "@tanstack/react-store"
import { ArrowsPointingOutIcon, GlobeAltIcon, MinusIcon, Square2StackIcon, XMarkIcon } from "@heroicons/react/24/outline"
import { useCallback, useState } from "react"
import { Button } from "../ui/button"
import { IconButton } from "../ui/icon-button"
import { browserStore } from "./browser-store"

export function BrowserPanel() {
  const state = useStore(browserStore, (value) => value)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const focused = state.pages.find((page) => page.botId === state.focusedBotId)
  const viewport = useCallback((element: HTMLDivElement | null) => {
    if (!element) {
      return
    }

    const update = () => {
      const bounds = element.getBoundingClientRect()

      void window.desktop.setBrowserBounds({ x: Math.round(bounds.x), y: Math.round(bounds.y), width: Math.floor(bounds.width), height: Math.floor(bounds.height) }).catch(() => setError("Não foi possível mostrar o navegador."))
    }
    const observer = new ResizeObserver(update)
    observer.observe(element)
    update()

    return () => observer.disconnect()
  }, [])

  async function handleAction(action: () => Promise<void>) {
    setPending(true)
    setError(null)
    await action().catch(() => setError("Não foi possível alterar o navegador. Tente novamente."))
    setPending(false)
  }

  if (!state.pages.length) {
    return null
  }

  if (focused) {
    return (
      <section className="fixed inset-0 z-40 flex flex-col bg-surface-raised p-4 text-primary" role="dialog" aria-modal="true" aria-label={`Navegador de ${focused.botName}`} onKeyDown={(event) => { if (event.key === "Escape") { void handleAction(() => window.desktop.minimizeBrowser()) } }}>
        <header className="flex shrink-0 items-center gap-3 pb-4">
          <GlobeAltIcon className="size-5 shrink-0 text-secondary" aria-hidden="true" />
          <p className="min-w-0 flex-1 truncate text-control text-primary">{focused.url}</p>
          <IconButton label="Recolher navegador" tooltipPlacement="left" disabled={pending} onClick={() => void handleAction(() => window.desktop.minimizeBrowser())}><MinusIcon aria-hidden="true" /></IconButton>
          <IconButton label="Maximizar ou restaurar janela" tooltipPlacement="left" disabled={pending} onClick={() => void handleAction(() => window.desktop.toggleMaximizeWindow())}><Square2StackIcon aria-hidden="true" /></IconButton>
          <IconButton label="Fechar navegador" tooltipPlacement="left" disabled={pending} onClick={() => void handleAction(() => window.desktop.closeBrowser(focused.botId))}><XMarkIcon aria-hidden="true" /></IconButton>
        </header>
        <div key={focused.botId} ref={viewport} className="min-h-0 flex-1 bg-canvas" />
        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-4 pt-4">
          <p className="min-w-0 flex-1 text-support text-secondary" role={error ? "alert" : "status"}>{error ?? focused.reason ?? `Sem pressa. ${focused.botName} está esperando.`}</p>
          <div className="ml-auto flex max-w-full items-center justify-end gap-2">
            <Button variant="text" disabled={pending} onClick={() => void handleAction(() => window.desktop.minimizeBrowser())}>Voltar para o chat</Button>
            <Button className="min-w-0 shrink whitespace-normal [overflow-wrap:anywhere]" disabled={pending} onClick={() => void handleAction(() => window.desktop.resumeBrowser(focused.botId))}>{pending ? "Aguarde…" : `Devolver para ${focused.botName}`}</Button>
          </div>
        </footer>
      </section>
    )
  }

  return (
    <aside className="absolute top-16 right-6 z-30 flex max-h-[calc(100vh-96px)] w-64 flex-col gap-3 overflow-y-auto max-[720px]:right-4 max-[720px]:w-48" aria-label="Navegadores dos Bots">
      {state.pages.map((page) => (
        <div key={page.botId} className="overflow-hidden rounded-xl border border-outline bg-surface-raised shadow-[0_2px_8px_rgb(0_0_0/45%)]">
          <button className="group block w-full cursor-pointer text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-default disabled:opacity-60" disabled={pending} onClick={() => void handleAction(() => window.desktop.takeBrowserControl(page.botId))} aria-label={`Ampliar e assumir navegador de ${page.botName}`}>
            <div className="relative aspect-[8/5] overflow-hidden bg-canvas">
              {page.image ? <img src={page.image} alt="" className="size-full object-contain" /> : <div className="grid size-full place-items-center text-secondary"><GlobeAltIcon className="size-8" aria-hidden="true" /></div>}
              <span className="absolute right-2 bottom-2 rounded-lg bg-surface-raised p-2 text-secondary group-hover:bg-surface-hover group-hover:text-primary group-active:bg-surface-active"><ArrowsPointingOutIcon className="size-4" aria-hidden="true" /></span>
            </div>
          </button>
          <div className="flex flex-col gap-1 p-3">
            <span className="truncate text-control font-semibold text-primary">{page.botName}</span>
            <span className="text-support text-secondary">{page.control === "user" ? page.reason ?? "Esperando você devolver o controle" : page.title}</span>
            {page.error && <span className="text-support text-status-error">{page.error}</span>}
          </div>
          {page.control === "user" && <div className="px-3 pb-3"><Button className="max-w-full whitespace-normal [overflow-wrap:anywhere]" variant="secondary" disabled={pending} onClick={() => void handleAction(() => window.desktop.resumeBrowser(page.botId))}>Devolver para {page.botName}</Button></div>}
        </div>
      ))}
      {error && <p className="rounded-lg bg-surface-raised p-3 text-support text-status-error" role="alert">{error}</p>}
    </aside>
  )
}
