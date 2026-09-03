import { XMarkIcon } from "@heroicons/react/24/outline"
import { type KeyboardEvent, type ReactNode, useId } from "react"
import { IconButton } from "./icon-button"

function DialogFrame({ titleId, className, onClose, children }: { titleId: string; className: string; onClose: () => void; children: ReactNode }) {
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape") {
      return
    }

    event.stopPropagation()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-overlay p-6 backdrop-blur-sm" role="presentation" onKeyDown={handleKeyDown} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <dialog className={className} aria-labelledby={titleId} aria-modal="true" open>
        {children}
      </dialog>
    </div>
  )
}

export function Dialog({ eyebrow, title, onClose, children }: { eyebrow: string; title: string; onClose: () => void; children: ReactNode }) {
  const titleId = useId()

  return (
    <DialogFrame titleId={titleId} className="relative inset-auto m-auto box-border flex max-h-[calc(100vh-48px)] w-[min(480px,100%)] max-w-none flex-col overflow-hidden rounded-[18px] border border-outline-strong bg-surface-raised p-0 text-primary shadow-[0_2px_8px_rgb(0_0_0/45%),0_28px_90px_rgb(0_0_0/58%)]" onClose={onClose}>
        <header className="flex items-center justify-between gap-4 border-b border-outline px-6 pt-6 pb-[18px]">
          <div className="min-w-0"><p className="text-metadata font-semibold tracking-[0.08em] text-muted uppercase">{eyebrow}</p><h2 className="mt-1.25 text-title font-semibold text-primary" id={titleId}>{title}</h2></div>
          <IconButton className="shrink-0" type="button" label="Fechar" tooltipPlacement="left" onClick={onClose}><XMarkIcon aria-hidden="true" /></IconButton>
        </header>
        {children}
    </DialogFrame>
  )
}

export function ConfirmationDialog({ icon, title, onClose, children, actions }: { icon: ReactNode; title: string; onClose: () => void; children: ReactNode; actions: ReactNode }) {
  const titleId = useId()

  return (
    <DialogFrame titleId={titleId} className="relative inset-auto m-auto box-border flex max-h-[calc(100vh-48px)] w-[min(480px,100%)] max-w-none flex-col overflow-hidden rounded-[18px] border border-outline-strong bg-surface p-2 text-primary shadow-[0_2px_8px_rgb(0_0_0/45%),0_28px_90px_rgb(0_0_0/58%)]" onClose={onClose}>
      <div className="flex min-h-0 flex-col overflow-hidden rounded-[14px] border border-outline bg-surface-raised">
        <header className="flex items-center gap-3 px-5 pt-5 pb-3">
          <span className="size-5 flex-none text-secondary [&>svg]:size-full" aria-hidden="true">{icon}</span>
          <h2 className="m-0 min-w-0 flex-1 text-title font-semibold text-primary" id={titleId}>{title}</h2>
          <IconButton className="shrink-0" type="button" label="Fechar" tooltipPlacement="left" onClick={onClose}><XMarkIcon aria-hidden="true" /></IconButton>
        </header>
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-5 pb-5">{children}</div>
      </div>
      <footer className="flex items-center justify-between gap-4 px-4 pt-4 pb-2">{actions}</footer>
    </DialogFrame>
  )
}

export function DialogBody({ children }: { children: ReactNode }) {
  return <div className="flex min-h-0 flex-col gap-4 overflow-y-auto p-6">{children}</div>
}

export function DialogActions({ children }: { children: ReactNode }) {
  return <footer className="flex items-center justify-between gap-4 border-t border-outline px-6 py-4">{children}</footer>
}
