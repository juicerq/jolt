import { ChevronLeftIcon } from "@heroicons/react/24/outline"
import { type MouseEvent, type ReactNode, useState } from "react"

const plateClassName = "rounded-l-xl border border-r-0 border-[var(--edge-tab-outline)] bg-surface-raised"
const openClassName = "hover:grid-cols-[20px_1fr] hover:[--edge-tab-open:1] hover:[--edge-tab-outline:var(--color-outline-strong)] hover:[--edge-tab-duration:220ms] hover:[--edge-tab-ease:cubic-bezier(0.2,0,0,1)] focus-within:grid-cols-[20px_1fr] focus-within:[--edge-tab-open:1] focus-within:[--edge-tab-outline:var(--color-outline-strong)] focus-within:[--edge-tab-duration:220ms] focus-within:[--edge-tab-ease:cubic-bezier(0.2,0,0,1)]"

export function ChatEdgeTab({ children }: { children: ReactNode }) {
  const [dismissed, setDismissed] = useState(false)

  function handleToggle(event: MouseEvent<HTMLButtonElement>) {
    setDismissed((current) => !current)

    if (event.detail > 0) {
      event.currentTarget.blur()
    }
  }

  return (
    <div className={`absolute top-1/2 right-0 z-2 grid -translate-y-1/2 grid-cols-[20px_0fr] items-center transition-[grid-template-columns] duration-[var(--edge-tab-duration)] ease-[var(--edge-tab-ease)] [--edge-tab-open:0] [--edge-tab-outline:var(--color-outline)] [--edge-tab-duration:150ms] [--edge-tab-ease:ease-in] motion-reduce:transition-none ${dismissed ? "" : openClassName}`} onPointerLeave={() => setDismissed(false)}>
      <button className={`${plateClassName} edge-tab-tongue relative z-[1] -mr-px grid h-[46px] place-items-center p-0 text-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring`} type="button" aria-label={dismissed ? "Abrir ações do Bot" : "Recolher ações do Bot"} onClick={handleToggle}>
        <ChevronLeftIcon className="size-3.5 opacity-[calc(0.35+0.65*var(--edge-tab-open))] rotate-[calc(var(--edge-tab-open)*180deg)] transition-[opacity,rotate] duration-[var(--edge-tab-duration)] ease-[var(--edge-tab-ease)] motion-reduce:transition-none" aria-hidden="true" />
      </button>
      <div className={`${plateClassName} min-w-0 overflow-hidden opacity-[var(--edge-tab-open)] transition-opacity duration-[var(--edge-tab-duration)] ease-[var(--edge-tab-ease)] motion-reduce:transition-none`}>
        <div className="flex w-11 flex-col items-center gap-1 p-1.5">{children}</div>
      </div>
    </div>
  )
}
