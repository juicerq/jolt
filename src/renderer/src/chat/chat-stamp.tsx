import type { ReactNode } from "react"
import { ChatCopyButton } from "./chat-copy"

const sideClassNames = { right: "left-full ml-3 items-start text-left", left: "right-full mr-3 items-end text-right max-md:self-end" }
const bodyLineClassName = "leading-[calc(var(--text-body)*var(--text-body--line-height))]"
const mobileRevealClassName = "max-md:static max-md:mt-1.5 max-md:hidden max-md:flex-row max-md:gap-1.5 max-md:opacity-100 max-md:group-focus-within:flex"
const anchorClassNames = {
  chip: { stamp: "-bottom-[5px] max-md:hidden", time: "" },
  line: { stamp: "bottom-0 max-md:hidden", time: "" },
  text: { stamp: `bottom-0 ${mobileRevealClassName}`, time: bodyLineClassName },
  bubble: { stamp: `bottom-3 ${mobileRevealClassName}`, time: bodyLineClassName },
}

interface StampProps { name: string; time: string; side?: keyof typeof sideClassNames; anchor?: keyof typeof anchorClassNames }

/** Desktop: floats beside the block on hover. Mobile: a tap on the block reveals it below the content; chips and lines show nothing. */
export function ChatStamp({ name, time, side = "right", anchor = "chip" }: StampProps) {
  return (
    <div className={`pointer-events-none absolute select-none ${sideClassNames[side]} ${anchorClassNames[anchor].stamp} flex flex-col whitespace-nowrap text-metadata font-medium text-muted opacity-0 transition-opacity duration-150 ease-out motion-reduce:transition-none group-hover:opacity-100 group-focus-within:opacity-100`}>
      <strong className="font-semibold text-secondary">{name}</strong>
      <span className={anchorClassNames[anchor].time}>{time}</span>
    </div>
  )
}

export function ChatStamped({ className = "", copy = "", children, ...stamp }: StampProps & { className?: string; copy?: string; children: ReactNode }) {
  return (
    <div className={`group relative outline-none ${className}`} tabIndex={-1}>
      {children}
      {copy && <ChatCopyButton className="top-1.5 right-1.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100" content={copy} label="Copiar mensagem" copiedLabel="Mensagem copiada" />}
      <ChatStamp {...stamp} />
    </div>
  )
}
