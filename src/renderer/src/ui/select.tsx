import { ChevronDownIcon } from "@heroicons/react/24/outline"
import type { ReactNode, SelectHTMLAttributes } from "react"
import { fieldControlClassName } from "./field"

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { icon?: ReactNode }

export function Select({ className, icon, ...props }: SelectProps) {
  return (
    <span className={["relative block", className].filter(Boolean).join(" ")}>
      {icon && <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-secondary [&_svg]:size-4" aria-hidden="true">{icon}</span>}
      <select {...props} className={`${fieldControlClassName} base-select cursor-pointer pr-8 text-left hover:bg-surface-raised ${icon ? "pl-9" : ""}`} />
      <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-secondary" aria-hidden="true" />
    </span>
  )
}
