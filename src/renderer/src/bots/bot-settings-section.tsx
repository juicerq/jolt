import type { ReactNode } from "react"

export function BotSettingsSection({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4" aria-label={title}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="m-0 text-label font-semibold uppercase text-muted">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}
