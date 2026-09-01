import { ArrowDownLeftIcon, ArrowDownRightIcon, ChevronDownIcon } from "@heroicons/react/24/outline"
import type { TaskStatus } from "../../../shared/tasks"
import { blurMouseClick } from "../ui/blur-mouse-click"
import { ChatContent, chatChipClassName, chatGuideClassName } from "./chat-content"
import { ChatStamp } from "./chat-stamp"

type Kind = "result" | "assignment"

const resultLabels: Record<TaskStatus, (name: string) => string> = {
  working: (name) => `${name} retornou`,
  done: (name) => `${name} retornou`,
  interrupted: (name) => `${name} não concluiu a Tarefa`,
  failed: (name) => `${name} não concluiu a Tarefa`,
}

const icons: Record<Kind, typeof ArrowDownLeftIcon> = { result: ArrowDownLeftIcon, assignment: ArrowDownRightIcon }

function label(kind: Kind, status: TaskStatus, name: string) {
  if (kind === "assignment") {
    return `${name} delegou uma Tarefa`
  }

  return resultLabels[status](name)
}

export function ChatMemberResult({ kind = "result", name, status = "done", time, content, open = false }: { kind?: Kind; name: string; status?: TaskStatus; time: string; content: string; open?: boolean }) {
  const Icon = icons[kind]

  return (
    <div className="group w-fit max-w-[720px] self-start">
      <details onClick={blurMouseClick} className="group/call text-support text-muted transition-[opacity,transform] duration-180 ease-out starting:translate-y-1 starting:opacity-0 motion-reduce:transition-none" open={open}>
        <summary className={chatChipClassName}>
          <Icon className="size-4" aria-hidden="true" />
          <span>{label(kind, status, name)}</span>
          <ChevronDownIcon className="size-[13px] transition-transform duration-150 ease-out group-open/call:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
          <ChatStamp name={name} time={time} />
        </summary>
        <div className={`${chatGuideClassName} mt-2 mb-1 ml-[14px] max-w-[620px] py-1 pl-4 text-secondary [&_*]:text-support`}>
          <ChatContent content={content} />
        </div>
      </details>
    </div>
  )
}
