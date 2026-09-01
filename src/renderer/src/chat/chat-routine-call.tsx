import { ChevronDownIcon, ClockIcon } from "@heroicons/react/24/outline"
import { blurMouseClick } from "../ui/blur-mouse-click"
import { chatGuideClassName } from "./chat-content"

export function ChatRoutineCall({ botName, time, content, open = false }: { botName: string; time: string; content: string; open?: boolean }) {
  return (
    <details onClick={blurMouseClick} className="group relative w-[min(620px,100%)] text-support text-muted transition-[opacity,transform] duration-180 ease-out starting:translate-y-1 starting:opacity-0 motion-reduce:transition-none" open={open}>
      <div className="pointer-events-none absolute -top-5 left-0 flex items-center gap-3 text-metadata font-medium opacity-0 transition-opacity duration-150 ease-out motion-reduce:transition-none group-hover:opacity-100 group-focus-within:opacity-100"><strong className="font-semibold text-secondary">Rotina</strong><span>{time}</span></div>
      <summary className="grid w-fit cursor-pointer list-none grid-cols-[16px_auto_14px] items-center gap-[7px] rounded-lg px-[7px] py-[5px] hover:bg-surface-hover hover:text-secondary focus-visible:bg-surface-hover focus-visible:text-secondary focus-visible:outline-none [&::-webkit-details-marker]:hidden [&_svg]:stroke-[1.75]">
        <ClockIcon className="size-4" aria-hidden="true" />
        <span>Uma Rotina chamou {botName}</span>
        <ChevronDownIcon className="size-[13px] transition-transform duration-150 ease-out group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
      </summary>
      <p className={`${chatGuideClassName} mt-2 mb-1 ml-[14px] whitespace-pre-wrap py-1 pl-4 text-support text-secondary`}>{content}</p>
    </details>
  )
}
