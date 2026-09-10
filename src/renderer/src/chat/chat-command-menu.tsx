import type { ReactNode } from "react"
import { BotFace } from "../bots/bot-face"
import { MenuOption, menuCardClassName } from "../ui/menu"

export interface ChatMenuChoice { key: string; label: string; detail: string; avatar?: string; icon?: ReactNode }

interface ChatCommandMenuProps {
  id: string
  label: string
  choices: ChatMenuChoice[]
  highlighted: number
  onHighlight: (index: number) => void
  onPick: (index: number) => void
  status?: string
}

export function ChatCommandMenu({ id, label, choices, highlighted, onHighlight, onPick, status }: ChatCommandMenuProps) {
  return (
    <div className={`${menuCardClassName} absolute bottom-full left-0 mb-2 max-h-72 max-w-full overflow-y-auto`} id={id} role="listbox" aria-label={label} onMouseDown={(event) => event.preventDefault()}>
      {choices.map((choice, index) => (
        <div key={choice.key} id={`${id}-${index}`} role="option" aria-selected={index === highlighted} ref={(node) => { if (index === highlighted) { node?.scrollIntoView({ block: "nearest" }) } }}>
          <MenuOption label={choice.label} detail={choice.detail} icon={choice.avatar ? <BotFace className="size-5 shrink-0" name={choice.avatar} size={20} /> : choice.icon} selected={index === highlighted} onSelect={() => onPick(index)} onHover={() => onHighlight(index)} />
        </div>
      ))}
      {status && <p className="m-0 max-w-80 px-2 py-1.5 text-support text-muted" role="status">{status}</p>}
    </div>
  )
}
