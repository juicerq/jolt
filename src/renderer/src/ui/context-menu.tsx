import { Fragment, type KeyboardEvent, type MouseEvent, type ReactNode, useId, useRef } from "react"
import { createPortal } from "react-dom"
import { menuCardClassName, menuRowClassName } from "./menu"

interface ContextAction {
  label: string
  icon?: ReactNode
  disabled?: boolean
  separatorBefore?: boolean
  danger?: boolean
  onSelect: () => void
}

/** Shared context menu: right-click, Shift+F10, or an explicit options button. */
export function ContextMenu({ label, actions, children }: { label: string; actions: ContextAction[]; children: (open: (event: MouseEvent<HTMLElement>) => void) => ReactNode }) {
  const id = useId()
  const menu = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLElement | null>(null)

  function show(target: HTMLElement, x: number, y: number) {
    const element = menu.current

    if (!element) {
      return
    }

    trigger.current = target
    element.showPopover()
    const bounds = element.getBoundingClientRect()
    element.style.left = `${Math.max(8, Math.min(x, window.innerWidth - bounds.width - 8))}px`
    element.style.top = `${Math.max(8, Math.min(y, window.innerHeight - bounds.height - 8))}px`
    element.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus()
  }

  function open(event: MouseEvent<HTMLElement>) {
    event.preventDefault()
    event.stopPropagation()
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>("button, a, [tabindex]") : null
    const anchor = target ?? event.currentTarget
    const bounds = anchor.getBoundingClientRect()

    // Keep the pointer inside the rounded menu so pointerup does not light-dismiss it.
    show(anchor, event.clientX ? event.clientX - 8 : bounds.left, event.clientY ? event.clientY - 8 : bounds.bottom)
  }

  function close() {
    menu.current?.hidePopover()
    trigger.current?.focus()
  }

  function handleKeys(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" || event.key === "Tab") {
      event.stopPropagation()
      close()

      return
    }

    const options = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")]
    const current = options.findIndex((option) => option === document.activeElement)
    const positions: Record<string, number> = { ArrowDown: (current + 1) % options.length, ArrowUp: (current - 1 + options.length) % options.length, Home: 0, End: options.length - 1 }
    const next = positions[event.key]

    if (next !== undefined) {
      event.preventDefault()
      event.stopPropagation()
      options[next]?.focus()
    }
  }

  return (
    <span className="contents" onContextMenu={open} onKeyDown={(event) => {
      if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
        event.preventDefault()
        event.stopPropagation()
        const target = event.target instanceof HTMLElement ? event.target : event.currentTarget
        const bounds = target.getBoundingClientRect()

        show(target, bounds.left, bounds.bottom)
      }
    }}>
      {children(open)}
      {createPortal(<div ref={menu} id={id} popover="auto" role="menu" aria-label={label} className={`${menuCardClassName} fixed inset-auto max-h-[calc(100dvh-16px)] max-w-[calc(100vw-16px)] overflow-y-auto`} onKeyDown={handleKeys}>
        {actions.map((action) => <Fragment key={action.label}>
          {action.separatorBefore && <div role="separator" className="my-1.5 border-t border-outline" />}
          <button type="button" role="menuitem" tabIndex={-1} disabled={action.disabled} className={`${menuRowClassName} bg-transparent hover:bg-surface-hover focus:bg-surface-hover ${action.danger ? "text-status-error" : "text-secondary hover:text-primary focus:text-primary"} [&>svg]:size-4 [&>svg]:shrink-0`} onClick={() => { close(); action.onSelect() }}>
            {action.icon}<span>{action.label}</span>
          </button>
        </Fragment>)}
      </div>, document.body)}
    </span>
  )
}
