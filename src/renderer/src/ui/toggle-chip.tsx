import type { ButtonHTMLAttributes } from "react"

type ToggleChipProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-pressed"> & { pressed: boolean }

const baseClassName = "rounded-md border px-2 py-1.5 text-metadata font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-default disabled:opacity-40 motion-reduce:transition-none"

const stateClassNames = {
  pressed: "border-focus bg-surface-active text-primary",
  rest: "border-outline-strong bg-transparent text-muted hover:bg-surface-hover hover:text-secondary",
}

export function ToggleChip({ pressed, className, ...props }: ToggleChipProps) {
  return <button {...props} type="button" className={[baseClassName, pressed ? stateClassNames.pressed : stateClassNames.rest, className].filter(Boolean).join(" ")} aria-pressed={pressed} />
}
