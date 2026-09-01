import type { ButtonHTMLAttributes } from "react"

type SwitchProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-checked" | "onChange" | "role" | "type"> & { checked: boolean; onChange: (checked: boolean) => void }

const trackClassName = "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border p-0 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-default disabled:opacity-40 motion-reduce:transition-none"

const stateClassNames = {
  on: "border-accent bg-accent",
  off: "border-outline-strong bg-surface-active hover:border-focus",
}

const thumbClassName = "ml-[3px] size-3.5 rounded-full transition-[transform,background-color] duration-150 motion-reduce:transition-none"

const thumbStateClassNames = {
  on: "translate-x-3.5 bg-canvas",
  off: "translate-x-0 bg-secondary",
}

export function Switch({ checked, className, onChange, ...props }: SwitchProps) {
  const state = checked ? "on" : "off"

  return (
    <button {...props} type="button" role="switch" aria-checked={checked} className={[trackClassName, stateClassNames[state], className].filter(Boolean).join(" ")} onClick={() => onChange(!checked)}>
      <span className={`${thumbClassName} ${thumbStateClassNames[state]}`} aria-hidden="true" />
    </button>
  )
}
