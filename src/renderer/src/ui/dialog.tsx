import { createPortal } from "react-dom"
import { XMarkIcon } from "@heroicons/react/24/outline"
import { type KeyboardEvent, type ReactNode, useId } from "react"
import { IconButton } from "./icon-button"

const sheetClassName = "mobile-sheet fixed inset-0 m-auto box-border flex max-h-[calc(100vh-48px)] w-[min(480px,calc(100%-48px))] max-w-none flex-col overflow-hidden rounded-[18px] border border-outline-strong text-primary backdrop:bg-transparent shadow-[0_2px_8px_rgb(0_0_0/45%),0_28px_90px_rgb(0_0_0/58%)]"

/** Centered on desktop; a bottom sheet on mobile. */
function DialogFrame({ titleId, className, onClose, children }: { titleId: string; className: string; onClose: () => void; children: ReactNode }) {
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape") {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    onClose()
  }

  return createPortal(
    <div className="fixed inset-0 z-40 grid place-items-center bg-overlay p-6 backdrop-blur-sm" role="presentation" onKeyDown={handleKeyDown}>
      <dialog
        className={className}
        aria-labelledby={titleId}
        aria-modal="true"
        closedby="any"
        ref={(node) => {
          if (node && !node.open) {
            node.showModal()
          }
        }}
        onClose={(event) => {
          if (event.target === event.currentTarget) {
            onClose()
          }
        }}
        onCancel={(event) => {
          event.stopPropagation()
          event.preventDefault()
          onClose()
        }}
      >
        {children}
      </dialog>
    </div>,
    document.body,
  )
}

export function Dialog({ eyebrow, title, onClose, children }: { eyebrow: string; title: string; onClose: () => void; children: ReactNode }) {
  const titleId = useId()

  return (
    <DialogFrame titleId={titleId} className={`${sheetClassName} bg-surface-raised p-0 max-md:pb-[var(--safe-bottom)]`} onClose={onClose}>
        <header className="flex items-center justify-between gap-4 border-b border-outline px-6 pt-6 pb-[18px] max-md:px-5 max-md:pt-5 max-md:pb-4">
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
    <DialogFrame titleId={titleId} className={`${sheetClassName} bg-surface p-2 max-md:pb-[calc(8px+var(--safe-bottom))]`} onClose={onClose}>
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
  return <div className="flex min-h-0 flex-col gap-4 overflow-y-auto p-6 max-md:p-5">{children}</div>
}

/** File viewers need the full height, including on mobile. */
export function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const titleId = useId()

  return <DialogFrame titleId={titleId} onClose={onClose} className="fixed inset-y-0 right-0 left-auto m-0 flex h-dvh max-h-none w-[min(720px,calc(100%-48px))] max-w-none flex-col overflow-hidden rounded-l-lg border-0 border-l border-outline bg-surface-raised p-0 text-primary shadow-lg transition-transform duration-200 ease-out starting:translate-x-full backdrop:bg-transparent motion-reduce:transition-none max-md:w-full max-md:rounded-none max-md:border-0 max-md:pt-[var(--safe-top)] max-md:pb-[var(--safe-bottom)]">
    <h2 id={titleId} className="sr-only">{title}</h2>
    {children}
  </DialogFrame>
}

export function DialogActions({ children }: { children: ReactNode }) {
  return <footer className="flex items-center justify-between gap-4 border-t border-outline px-6 py-4 max-md:px-5">{children}</footer>
}

export function ImageDialog({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const titleId = useId()

  return (
    <DialogFrame titleId={titleId} className="fixed inset-0 m-auto box-border h-fit max-h-[calc(100vh-48px)] w-fit max-w-[calc(100vw-48px)] overflow-hidden rounded-[18px] border border-outline-strong bg-surface-raised p-2 text-primary backdrop:bg-transparent shadow-[0_2px_8px_rgb(0_0_0/45%),0_28px_90px_rgb(0_0_0/58%)]" onClose={onClose}>
      <h2 className="sr-only" id={titleId}>{alt}</h2>
      <img className="block max-h-[calc(100vh-64px)] max-w-full rounded-[12px] object-contain" src={src} alt={alt} />
      <IconButton className="top-4 right-4" position="absolute" shape="circle" size={28} tone="canvas" type="button" label="Fechar" tooltipPlacement="left" onClick={onClose}><XMarkIcon aria-hidden="true" /></IconButton>
    </DialogFrame>
  )
}
