import { ChevronLeftIcon } from "@heroicons/react/24/outline"
import { type MouseEvent, type ReactNode, useState } from "react"
import { blurMouseClick } from "../ui/blur-mouse-click"

const plateClassName = "rounded-l-xl border border-r-0 border-outline bg-surface-raised"
const openClassName = "grid-cols-[20px_45px] [--edge-tab-open:1] [--edge-tab-step:steps(1,jump-start)]"

export function ChatEdgeTab({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(true)

  function handleToggle(event: MouseEvent<HTMLButtonElement>) {
    setOpen((current) => !current)
    blurMouseClick(event)
  }

  return (
    <div className={`absolute top-1/2 right-0 z-2 grid -translate-y-1/2 grid-cols-[20px_0px] items-center transition-[grid-template-columns] duration-150 ease-out [--edge-tab-open:0] [--edge-tab-duration:150ms] [--edge-tab-ease:ease-out] [--edge-tab-outline:var(--color-outline)] [--edge-tab-step:steps(1,jump-end)] motion-reduce:transition-none ${open ? openClassName : ""}`}>
      <button className={`${plateClassName} edge-tab-tongue relative z-[1] -mr-px grid h-[46px] place-items-center p-0 text-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring`} type="button" aria-label={open ? "Recolher ações do Bot" : "Abrir ações do Bot"} onClick={handleToggle}>
        <ChevronLeftIcon className="size-3.5 rotate-[calc(var(--edge-tab-open)*180deg)] transition-[rotate] duration-150 ease-out motion-reduce:transition-none" aria-hidden="true" />
      </button>
      <div className={`${plateClassName} min-w-0 overflow-hidden opacity-[var(--edge-tab-open)] [&:has(>div>button:only-of-type)]:rounded-l-none transition-opacity duration-150 ease-[var(--edge-tab-step)] motion-reduce:transition-none`}>
        <div className="flex w-11 flex-col items-center gap-1 p-1.5" onClick={blurMouseClick}>{children}</div>
      </div>
    </div>
  )
}
