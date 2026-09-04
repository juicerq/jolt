import type { MouseEvent, ReactNode } from "react"

export const menuSurfaceClassName = "m-0 rounded-xl border border-outline bg-surface-raised p-1.5 text-primary shadow-[0_2px_6px_rgb(0_0_0/28%),0_12px_32px_rgb(0_0_0/32%)]"

export const menuCardClassName = `${menuSurfaceClassName} w-max min-w-52`

export function MenuLabel({ id, children }: { id?: string; children: ReactNode }) {
  return <p className="m-0 px-2 pt-1 pb-1 text-metadata font-medium text-muted" id={id}>{children}</p>
}

export function MenuDivider() {
  return <hr className="my-1.5 border-0 border-t border-outline" />
}

interface MenuOptionProps {
  label: string
  detail?: string
  icon?: ReactNode
  selected: boolean
  standard?: boolean
  disabled?: boolean
  onSelect(): void
  onHover?(): void
}

export function MenuOption({ label, detail, icon, selected, standard = false, disabled = false, onSelect, onHover }: MenuOptionProps) {
  const tone = selected ? "bg-surface-active text-primary" : "bg-transparent text-secondary hover:bg-surface-hover hover:text-primary"

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    event.currentTarget.closest<HTMLElement>("[popover]")?.hidePopover()
    onSelect()
  }

  return (
    <button className={`mb-px flex w-full min-w-0 items-center gap-2 rounded-lg border-0 px-2 py-1.5 text-left text-control font-medium transition-colors duration-150 last:mb-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-default disabled:opacity-50 motion-reduce:transition-none ${tone}`} type="button" aria-pressed={selected} disabled={disabled} onClick={handleClick} onMouseEnter={onHover}>
      {icon}
      <span className="shrink-0 first-letter:uppercase">{label}</span>
      {detail && <span className="min-w-0 truncate text-metadata font-normal text-muted">{detail}</span>}
      {standard && <span className="shrink-0 rounded-md bg-surface-hover px-1.5 py-px text-metadata font-medium text-muted">Padrão</span>}
    </button>
  )
}
