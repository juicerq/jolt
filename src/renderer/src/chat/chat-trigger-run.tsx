import { BoltIcon, ChevronDownIcon } from "@heroicons/react/24/outline"
import { blurMouseClick } from "../ui/blur-mouse-click"
import { chatChipClassName, chatGuideClassName } from "./chat-content"
import { ChatStamp } from "./chat-stamp"

export function ChatTriggerRun({ botName, time, content, open = false }: { botName: string; time: string; content: string; open?: boolean }) {
  return (
    <div className="group w-fit max-w-[720px] self-start">
      <details onClick={blurMouseClick} className="group/run text-support text-muted transition-[opacity,transform] duration-180 ease-out starting:translate-y-1 starting:opacity-0 motion-reduce:transition-none" open={open}>
        <summary className={chatChipClassName}>
          <BoltIcon className="size-4" aria-hidden="true" />
          <span>Um Gatilho chamou {botName}</span>
          <ChevronDownIcon className="size-[13px] transition-transform duration-150 ease-out group-open/run:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
          <ChatStamp name="Gatilho" time={time} />
        </summary>
        <p className={`${chatGuideClassName} mt-2 mb-1 ml-[14px] max-w-[620px] whitespace-pre-wrap py-1 pl-4 text-support text-secondary`}>{content}</p>
      </details>
    </div>
  )
}
