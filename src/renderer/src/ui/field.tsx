import type { ReactNode } from "react"

export const fieldControlClassName =
  "w-full rounded-lg border border-outline-strong bg-canvas px-3 py-2.5 text-control font-medium text-primary placeholder:text-muted focus-visible:border-focus focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"

const fieldClassName = "flex min-w-0 flex-col gap-2 text-control font-semibold text-secondary"

export function Field({ label, optional = false, as = "label", children }: { label: string; optional?: boolean; as?: "label" | "div"; children: ReactNode }) {
  const Wrapper = as
  const heading = <span className="flex items-baseline justify-between">{label}{optional && <small className="text-metadata font-medium text-muted">Opcional</small>}</span>

  return <Wrapper className={fieldClassName}>{heading}{children}</Wrapper>
}
