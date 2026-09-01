import type { ReactNode } from "react"

const sideClassNames = { right: "left-full ml-3 items-start text-left", left: "right-full mr-3 items-end text-right" }
const bodyLineClassName = "leading-[calc(var(--text-body)*var(--text-body--line-height))]"
const anchorClassNames = {
  chip: { stamp: "-bottom-[5px]", time: "" },
  line: { stamp: "bottom-0", time: "" },
  text: { stamp: "bottom-0", time: bodyLineClassName },
  bubble: { stamp: "bottom-3", time: bodyLineClassName },
}

type StampProps = { name: string; time: string; side?: keyof typeof sideClassNames; anchor?: keyof typeof anchorClassNames }

export function ChatStamp({ name, time, side = "right", anchor = "chip" }: StampProps) {
  return (
    <div className={`pointer-events-none absolute ${sideClassNames[side]} ${anchorClassNames[anchor].stamp} flex flex-col whitespace-nowrap text-metadata font-medium text-muted opacity-0 transition-opacity duration-150 ease-out motion-reduce:transition-none group-hover:opacity-100 group-focus-within:opacity-100`}>
      <strong className="font-semibold text-secondary">{name}</strong>
      <span className={anchorClassNames[anchor].time}>{time}</span>
    </div>
  )
}

export function ChatStamped({ className = "", children, ...stamp }: StampProps & { className?: string; children: ReactNode }) {
  return (
    <div className={`group relative ${className}`}>
      {children}
      <ChatStamp {...stamp} />
    </div>
  )
}
