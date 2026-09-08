import { BotFace } from "../bots/bot-face"
import { MenuOption, menuCardClassName } from "../ui/menu"

export interface ChatMenuChoice { key: string; label: string; detail: string; avatar?: string }

interface ChatCommandMenuProps {
  id: string
  label: string
  choices: ChatMenuChoice[]
  highlighted: number
  onHighlight: (index: number) => void
  onPick: (index: number) => void
}

export function ChatCommandMenu({ id, label, choices, highlighted, onHighlight, onPick }: ChatCommandMenuProps) {
  return (
    <div className={`${menuCardClassName} absolute bottom-full left-0 mb-2 max-h-72 max-w-full overflow-y-auto`} id={id} role="listbox" aria-label={label}>
      {choices.map((choice, index) => (
        <MenuOption key={choice.key} label={choice.label} detail={choice.detail} icon={choice.avatar ? <BotFace className="size-5 shrink-0" name={choice.avatar} size={20} /> : undefined} selected={index === highlighted} onSelect={() => onPick(index)} onHover={() => onHighlight(index)} />
      ))}
    </div>
  )
}
