import { XMarkIcon } from "@heroicons/react/24/outline"
import { type KeyboardEvent, type ReactNode, useId } from "react"
import { IconButton } from "./icon-button"

export function Dialog({ eyebrow, title, onClose, children }: { eyebrow: string; title: string; onClose: () => void; children: ReactNode }) {
  const titleId = useId()

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape") {
      return
    }

    event.stopPropagation()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-overlay p-6 backdrop-blur-sm" role="presentation" onKeyDown={handleKeyDown} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <dialog className="relative inset-auto m-auto box-border flex max-h-[calc(100vh-48px)] w-[min(480px,100%)] max-w-none flex-col overflow-hidden rounded-[18px] border border-outline-strong bg-surface-raised p-0 text-primary shadow-[0_2px_8px_rgb(0_0_0/45%),0_28px_90px_rgb(0_0_0/58%)]" aria-labelledby={titleId} open>
        <header className="flex items-center justify-between gap-4 border-b border-outline px-6 pt-6 pb-[18px]">
          <div className="min-w-0"><p className="text-metadata font-semibold tracking-[0.08em] text-muted uppercase">{eyebrow}</p><h2 className="mt-1.25 text-title font-semibold text-primary" id={titleId}>{title}</h2></div>
          <IconButton className="shrink-0" type="button" label="Fechar" tooltipPlacement="left" onClick={onClose}><XMarkIcon aria-hidden="true" /></IconButton>
        </header>
        {children}
      </dialog>
    </div>
  )
}

export function DialogBody({ children }: { children: ReactNode }) {
  return <div className="flex min-h-0 flex-col gap-4 overflow-y-auto p-6">{children}</div>
}

export function DialogActions({ children }: { children: ReactNode }) {
  return <footer className="flex items-center justify-between gap-4 border-t border-outline px-6 py-4">{children}</footer>
}
