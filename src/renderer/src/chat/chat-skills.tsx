import { SparklesIcon } from "@heroicons/react/24/outline"
import type { Skill } from "@src/shared/skills"
import { chatSlash } from "./chat-command-definitions"

export function suggestChatSkills(content: string, skills: Skill[], caret: number) {
  const word = chatSlash(content, caret)?.word

  if (word === undefined) {
    return []
  }

  const query = word.replace(/^skill:/i, "").toLowerCase()

  return skills.filter((skill) => skill.name.toLowerCase().includes(query))
}

export function selectedChatSkill(content: string) {
  const match = /^\/skill:([^\s]+)(?=\s|$)/.exec(content)

  if (!match?.[1]) {
    return null
  }

  return { name: match[1], token: match[0], rest: content.slice(match[0].length) }
}

export function ChatSkillChip({ name, onRemove }: { name: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      className="inline-flex max-w-[min(100%,16rem)] items-center gap-1 align-baseline rounded-sm font-sans font-normal text-secondary hover:text-primary active:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      title={`Remover skill ${name}`}
      aria-label={`Remover skill ${name}`}
      onClick={onRemove}
    >
      <SparklesIcon className="size-3.5 shrink-0 self-center" aria-hidden="true" />
      <span className="truncate underline decoration-outline-strong underline-offset-3">{name}</span>
    </button>
  )
}
