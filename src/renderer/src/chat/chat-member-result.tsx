import { ChevronDownIcon } from "@heroicons/react/24/outline"
import type { TaskStatus } from "../../../shared/tasks"
import { ChatContent } from "./chat-content"

const labels: Record<TaskStatus, string> = {
  working: "Resultado",
  done: "Resultado",
  interrupted: "Tarefa não concluída",
  failed: "Tarefa não concluída",
}

function preview(content: string) {
  const firstLine = content.split("\n").find((line) => line.trim())

  return (firstLine ?? "").replace(/[*_`#>]/g, "").trim()
}

export function ChatMemberResult({ name, status = "done", time, content, open = false }: { name: string; status?: TaskStatus; time: string; content: string; open?: boolean }) {
  const concluded = status === "done" || status === "working"
  const previewClasses = concluded ? "text-muted" : "text-status-warning"

  return (
    <div className="group relative w-[min(620px,100%)]">
      <div className="pointer-events-none absolute -top-5 left-0 flex items-center gap-3 text-metadata font-medium text-muted opacity-0 transition-opacity duration-150 ease-out motion-reduce:transition-none group-hover:opacity-100 group-focus-within:opacity-100"><strong className="font-semibold text-secondary">{name}</strong><span>{labels[status]}</span><span>{time}</span></div>
      <details className="group/result rounded-xl border border-outline transition-[opacity,transform] duration-180 ease-out starting:translate-y-1 starting:opacity-0 motion-reduce:transition-none" open={open}>
        <summary className="grid cursor-pointer list-none grid-cols-[auto_minmax(0,1fr)_14px] items-center gap-3 rounded-xl px-3.5 py-2 text-support hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring group-open/result:rounded-b-none [&::-webkit-details-marker]:hidden">
          <strong className="text-metadata font-semibold text-secondary">{name}</strong>
          <span className={`truncate group-open/result:invisible ${previewClasses}`}>{concluded ? preview(content) : labels[status]}</span>
          <ChevronDownIcon className="size-[13px] stroke-[1.75] text-muted transition-transform duration-150 ease-out group-open/result:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
        </summary>
        <div className="border-t border-outline px-3.5 py-3">
          <ChatContent content={content} />
        </div>
      </details>
    </div>
  )
}
