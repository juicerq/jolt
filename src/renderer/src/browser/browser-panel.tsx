import { useStore } from "@tanstack/react-store"
import { ArrowsPointingOutIcon, GlobeAltIcon, MinusIcon, Square2StackIcon, XMarkIcon } from "@heroicons/react/24/outline"
import { type ComponentType, useCallback, useState } from "react"
import type { BrowserPreview } from "@src/shared/browser"
import { Button } from "../ui/button"
import { IconButton } from "../ui/icon-button"
import { browserStore } from "./browser-store"

export interface BrowserActions {
  Viewport: ComponentType<{ page: BrowserPreview }>
  watch: (botId: string) => Promise<unknown>
  minimize: () => Promise<unknown>
  control?: {
    close: (botId: string) => Promise<unknown>
    closePopup: (botId: string) => Promise<unknown>
    resume: (botId: string) => Promise<unknown>
    takeControl: (botId: string) => Promise<unknown>
  }
}

function useBrowserAction() {
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function run(action: () => Promise<unknown>) {
    setPending(true)
    setError(null)
    await action().catch(() => setError("Não foi possível alterar o navegador. Tente novamente."))
    setPending(false)
  }

  return { error, pending, run }
}

export function BrowserPanel({ browser, sidebarOpen, onCloseSidebar }: { browser: BrowserActions; sidebarOpen: boolean; onCloseSidebar: () => void }) {
  const state = useStore(browserStore, (value) => value)
  const focused = state.pages.find((page) => page.botId === state.focusedBotId)

  if (!state.pages.length && !sidebarOpen) {
    return null
  }

  if (focused) {
    return <BrowserViewer key={focused.botId} browser={browser} page={focused} />
  }

  return <BrowserCards browser={browser} pages={state.pages} sidebarOpen={sidebarOpen} onCloseSidebar={onCloseSidebar} />
}

function browserStatus(page: BrowserPreview, canControl: boolean) {
  if (page.control === "user") {
    if (!canControl) {
      return `Você pode interagir com a página no computador.${page.reason ? ` ${page.reason}` : ""}`
    }

    return page.reason ?? `Você pode navegar ou passar o controle para ${page.botName}.`
  }

  if (!canControl) {
    return "Para interagir com o site, use o Mimo no computador."
  }

  return "Assuma o controle se precisar interagir com a página."
}

function BrowserViewer({ browser, page }: { browser: BrowserActions; page: BrowserPreview }) {
  const { error, pending, run } = useBrowserAction()
  const focusPanel = useCallback((element: HTMLElement | null) => element?.focus(), [])
  const control = browser.control
  const userControl = page.control === "user"
  const userLabel = control ? "Você está no controle" : "Controle no computador"
  const controlLabel = userControl ? `Passar para ${page.botName}` : "Assumir controle"
  const status = browserStatus(page, !!control)

  return (
    <section ref={focusPanel} tabIndex={-1} className="fixed inset-0 z-40 flex flex-col bg-surface-raised p-4 text-primary max-md:p-3 max-md:pt-[calc(12px+var(--safe-top))] max-md:pb-[calc(12px+var(--safe-bottom))]" role="dialog" aria-modal="true" aria-label={`Navegador de ${page.botName}`} onKeyDown={(event) => { if (event.key === "Escape") { void run(browser.minimize) } }}>
      <header className="flex shrink-0 flex-wrap items-center gap-3 pb-4 max-md:gap-2 max-md:pb-3">
        <GlobeAltIcon className="size-5 shrink-0 text-secondary max-md:hidden" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-control font-semibold">{page.botName}</p>
          <p className="text-support text-secondary">{userControl ? userLabel : "Bot no controle"}</p>
        </div>
        <p className="order-last m-0 w-full truncate text-support text-secondary md:order-none md:w-auto md:max-w-1/2" title={page.url}>{page.url}</p>
        {control ? <>
          {page.popup && <Button variant="text" disabled={pending} onClick={() => void run(() => control.closePopup(page.botId))}>Voltar à página</Button>}
          <IconButton label="Recolher navegador" tooltipPlacement="left" disabled={pending} onClick={() => void run(browser.minimize)}><MinusIcon aria-hidden="true" /></IconButton>
          <IconButton label="Maximizar ou restaurar janela" tooltipPlacement="left" disabled={pending} onClick={() => void run(window.desktop.toggleMaximizeWindow)}><Square2StackIcon aria-hidden="true" /></IconButton>
          <IconButton label="Fechar navegador" tooltipPlacement="left" disabled={pending} onClick={() => void run(() => control.close(page.botId))}><XMarkIcon aria-hidden="true" /></IconButton>
        </> : <IconButton label="Fechar visualização" tooltipPlacement="left" onClick={() => void run(browser.minimize)}><XMarkIcon aria-hidden="true" /></IconButton>}
      </header>
      <browser.Viewport page={page} />
      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-4 pt-4 max-md:gap-2 max-md:pt-3">
        <p className="min-w-0 flex-1 basis-full text-support text-secondary sm:basis-0" role={error || page.error ? "alert" : "status"}>{error ?? page.error ?? status}</p>
        <div className="ml-auto flex max-w-full items-center justify-end gap-2">
          <Button variant="text" disabled={pending} onClick={() => void run(browser.minimize)}>Voltar ao chat</Button>
          {control && <Button className="min-w-0 shrink whitespace-normal [overflow-wrap:anywhere]" disabled={pending || page.popup} onClick={() => void run(() => userControl ? control.resume(page.botId) : control.takeControl(page.botId))}>{pending ? "Aguarde…" : controlLabel}</Button>}
        </div>
      </footer>
    </section>
  )
}

function BrowserCards({ browser, pages, sidebarOpen, onCloseSidebar }: { browser: BrowserActions; pages: BrowserPreview[]; sidebarOpen: boolean; onCloseSidebar: () => void }) {
  const { error, pending, run } = useBrowserAction()
  const control = browser.control
  const focusPanel = useCallback((element: HTMLElement | null) => element?.focus(), [])

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
      {pages.length === 0 && <p className="p-3 text-support text-secondary">Nenhum navegador aberto.</p>}
      {pages.map((page) => (
        <div key={page.botId} className="shrink-0 overflow-hidden rounded-lg bg-surface-raised">
          <button className="group block w-full cursor-pointer text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-default disabled:opacity-60" disabled={pending} onClick={() => void run(() => browser.watch(page.botId))} aria-label={control && page.control === "user" ? `Abrir navegador de ${page.botName}` : `Assistir ao navegador de ${page.botName}`}>
            <div className="relative aspect-[8/5] overflow-hidden bg-canvas">
              {page.image ? <img src={page.image} alt="" className="size-full object-contain" /> : <div className="grid size-full place-items-center text-secondary"><GlobeAltIcon className="size-8" aria-hidden="true" /></div>}
              <span className="absolute right-2 bottom-2 flex items-center gap-2 rounded-lg bg-surface-raised p-2 text-support text-secondary group-hover:bg-surface-hover group-hover:text-primary group-active:bg-surface-active"><ArrowsPointingOutIcon className="size-4" aria-hidden="true" />{control && page.control === "user" ? "Abrir" : "Assistir"}</span>
            </div>
          </button>
          <div className="flex flex-col gap-1 p-3">
            <span className="truncate text-control font-semibold text-primary">{page.botName}</span>
            <span className="truncate text-support text-secondary" title={page.url}>{page.title}</span>
            {page.control === "user" && <span className="text-support text-secondary [overflow-wrap:anywhere]">{browserStatus(page, !!control)}</span>}
            {page.error && <span className="text-support text-status-error [overflow-wrap:anywhere]" role="alert">{page.error}</span>}
          </div>
          {control && page.control === "user" && !page.popup && <div className="px-3 pb-3"><Button className="max-w-full whitespace-normal [overflow-wrap:anywhere]" variant="secondary" disabled={pending} onClick={() => void run(() => control.resume(page.botId))}>Passar para {page.botName}</Button></div>}
        </div>
      ))}
      {error && <p className="rounded-lg bg-surface-raised p-3 text-support text-status-error" role="alert">{error}</p>}
      </div>
    </aside>
  )
}
