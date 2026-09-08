import type { ReactNode } from "react"

export const settingsPanelClassName = "rounded-xl bg-surface-raised px-4 py-3.5"

export function SettingsSection({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
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

export function SettingsRow({ label, description, children }: { label: string; description: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6">
      <div className="min-w-0 flex-1">
        <p className="m-0 text-control font-medium text-primary">{label}</p>
        <p className="m-0 mt-1 max-w-[46ch] text-support font-normal text-muted">{description}</p>
      </div>
      {children}
    </div>
  )
}
