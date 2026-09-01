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
  return (
    <details className="group/result w-[min(620px,100%)] rounded-xl border border-outline bg-surface transition-[opacity,transform] duration-180 ease-out starting:translate-y-1 starting:opacity-0 motion-reduce:transition-none" open={open}>
      <summary className="grid cursor-pointer list-none grid-cols-[auto_auto_auto_minmax(0,1fr)_14px] items-center gap-3 rounded-xl group-open/result:rounded-b-none px-3.5 py-2.5 text-metadata font-medium text-muted hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <strong className="font-semibold text-secondary">{name}</strong>
        <span>{labels[status]}</span>
        <span>{time}</span>
        <span className="truncate text-support font-normal group-open/result:invisible">{preview(content)}</span>
        <ChevronDownIcon className="size-[13px] stroke-[1.75] transition-transform duration-150 ease-out group-open/result:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
      </summary>
      <div className="border-t border-outline px-3.5 py-3">
        <ChatContent content={content} />
      </div>
    </details>
  )
}
