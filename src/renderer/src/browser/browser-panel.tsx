import { useStore } from "@tanstack/react-store"
import { ArrowsPointingOutIcon, GlobeAltIcon, MinusIcon, Square2StackIcon, XMarkIcon } from "@heroicons/react/24/outline"
import { useCallback, useState } from "react"
import type { BrowserPreview } from "@src/shared/browser"
import { Button } from "../ui/button"
import { IconButton } from "../ui/icon-button"
import { browserStore } from "./browser-store"

function controlCopy(page: BrowserPreview) {
  const userControl = page.control === "user"

  if (userControl) {
    return { userControl, label: `Devolver para ${page.botName}`, status: page.reason ?? `${page.botName} aguarda você devolver o controle.` }
  }

  return { userControl, label: "Assumir controle", status: "Assuma o controle se precisar interagir com a página." }
}

export function BrowserPanel({ sidebarOpen, onCloseSidebar }: { sidebarOpen: boolean; onCloseSidebar: () => void }) {
  const state = useStore(browserStore, (value) => value)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const focused = state.pages.find((page) => page.botId === state.focusedBotId)
  const focusPanel = useCallback((element: HTMLElement | null) => element?.focus(), [])
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

  if (!state.pages.length && !sidebarOpen) {
    return null
  }

  if (focused) {
    const { userControl, label, status } = controlCopy(focused)

    return (
      <section ref={focusPanel} tabIndex={-1} className="fixed inset-0 z-40 flex flex-col bg-surface-raised p-4 text-primary max-md:pt-[calc(16px+var(--safe-top))] max-md:pb-[calc(16px+var(--safe-bottom))]" role="dialog" aria-modal="true" aria-label={`Navegador de ${focused.botName}`} onKeyDown={(event) => { if (event.key === "Escape") { void handleAction(() => window.desktop.minimizeBrowser()) } }}>
        <header className="flex shrink-0 flex-wrap items-center gap-3 pb-4">
          <GlobeAltIcon className="size-5 shrink-0 text-secondary" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-control font-semibold">{focused.botName}</p>
            <p className="text-support text-secondary">{userControl ? "Você está no controle" : "Bot no controle"}</p>
          </div>
          <p className="order-last w-full truncate text-support text-secondary sm:order-none sm:w-auto sm:max-w-1/2">{focused.url}</p>
          {focused.popup && <Button variant="text" disabled={pending} onClick={() => void handleAction(() => window.desktop.closeBrowserPopup(focused.botId))}>Voltar à página</Button>}
          <IconButton label="Recolher navegador" tooltipPlacement="left" disabled={pending} onClick={() => void handleAction(() => window.desktop.minimizeBrowser())}><MinusIcon aria-hidden="true" /></IconButton>
          <IconButton label="Maximizar ou restaurar janela" tooltipPlacement="left" disabled={pending} onClick={() => void handleAction(() => window.desktop.toggleMaximizeWindow())}><Square2StackIcon aria-hidden="true" /></IconButton>
          <IconButton label="Fechar navegador" tooltipPlacement="left" disabled={pending} onClick={() => void handleAction(() => window.desktop.closeBrowser(focused.botId))}><XMarkIcon aria-hidden="true" /></IconButton>
        </header>
        <div key={`${focused.botId}:${focused.control}`} ref={viewport} className="min-h-0 flex-1 bg-canvas" />
        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-4 pt-4">
          <p className="min-w-0 flex-1 basis-full text-support text-secondary sm:basis-0" role={error || focused.error ? "alert" : "status"}>{error ?? focused.error ?? status}</p>
          <div className="ml-auto flex max-w-full items-center justify-end gap-2">
            <Button variant="text" disabled={pending} onClick={() => void handleAction(() => window.desktop.minimizeBrowser())}>Voltar ao chat</Button>
            <Button className="min-w-0 shrink whitespace-normal [overflow-wrap:anywhere]" disabled={pending || focused.popup} onClick={() => void handleAction(() => userControl ? window.desktop.resumeBrowser(focused.botId) : window.desktop.takeBrowserControl(focused.botId))}>{pending ? "Aguarde…" : label}</Button>
          </div>
        </footer>
      </section>
    )
  }

  return (
    <aside id="browser-sidebar" ref={sidebarOpen ? focusPanel : undefined} tabIndex={-1} data-open={sidebarOpen} className="z-30 mr-3 mt-16 mb-3 hidden w-80 min-w-0 shrink-0 flex-col overflow-hidden rounded-xl border border-outline bg-surface data-[open=true]:flex min-[96rem]:absolute min-[96rem]:top-16 min-[96rem]:right-3 min-[96rem]:m-0 min-[96rem]:flex min-[96rem]:max-h-[calc(100dvh-76px)] min-[96rem]:w-72 max-md:fixed max-md:top-[calc(60px+var(--safe-top))] max-md:right-2 max-md:bottom-[calc(8px+var(--safe-bottom))] max-md:left-2 max-md:z-40 max-md:m-0 max-md:flex max-md:w-auto max-md:rounded-t-none max-md:rounded-b-shell max-md:border-t-0 max-md:transition-[translate,visibility] max-md:duration-300 max-md:ease-[cubic-bezier(0.2,0,0,1)] max-md:data-[open=false]:pointer-events-none max-md:data-[open=false]:invisible max-md:data-[open=false]:translate-x-[calc(100%+8px)] motion-reduce:max-md:transition-none" aria-label="Navegadores dos Bots" onKeyDown={(event) => {
      if (event.key === "Escape") {
        event.stopPropagation()
        onCloseSidebar()
      }
    }}>
      <header className="flex min-h-12 shrink-0 items-center justify-between gap-3 px-4">
        <h2 className="m-0 text-control font-semibold text-primary">Navegadores</h2>
        <IconButton className="min-[96rem]:hidden" label="Fechar painel de navegadores" tooltipPlacement="left" onClick={onCloseSidebar}><XMarkIcon aria-hidden="true" /></IconButton>
      </header>
      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-3 pb-3">
      {state.pages.length === 0 && <p className="p-3 text-support text-secondary">Nenhum navegador aberto.</p>}
      {state.pages.map((page) => (
        <div key={page.botId} className="shrink-0 overflow-hidden rounded-lg bg-surface-raised">
          <button className="group block w-full cursor-pointer text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-default disabled:opacity-60" disabled={pending} onClick={() => void handleAction(() => window.desktop.watchBrowser(page.botId))} aria-label={page.control === "user" ? `Abrir navegador de ${page.botName}` : `Assistir ao navegador de ${page.botName}`}>
            <div className="relative aspect-[8/5] overflow-hidden bg-canvas">
              {page.image ? <img src={page.image} alt="" className="size-full object-contain" /> : <div className="grid size-full place-items-center text-secondary"><GlobeAltIcon className="size-8" aria-hidden="true" /></div>}
              <span className="absolute right-2 bottom-2 flex items-center gap-2 rounded-lg bg-surface-raised p-2 text-support text-secondary group-hover:bg-surface-hover group-hover:text-primary group-active:bg-surface-active"><ArrowsPointingOutIcon className="size-4" aria-hidden="true" />{page.control === "user" ? "Abrir" : "Assistir"}</span>
            </div>
          </button>
          <div className="flex flex-col gap-1 p-3">
            <span className="truncate text-control font-semibold text-primary">{page.botName}</span>
            <span className="truncate text-support text-secondary" title={page.url}>{page.title}</span>
            {page.control === "user" && <span className="text-support text-secondary [overflow-wrap:anywhere]">{page.reason ?? "Esperando você devolver o controle"}</span>}
            {page.error && <span className="text-support text-status-error [overflow-wrap:anywhere]" role="alert">{page.error}</span>}
          </div>
          {page.control === "user" && !page.popup && <div className="px-3 pb-3"><Button className="max-w-full whitespace-normal [overflow-wrap:anywhere]" variant="secondary" disabled={pending} onClick={() => void handleAction(() => window.desktop.resumeBrowser(page.botId))}>Devolver para {page.botName}</Button></div>}
        </div>
      ))}
      {error && <p className="rounded-lg bg-surface-raised p-3 text-support text-status-error" role="alert">{error}</p>}
      </div>
    </aside>
  )
}
