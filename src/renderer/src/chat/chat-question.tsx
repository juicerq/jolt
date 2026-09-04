import { CheckIcon } from "@heroicons/react/24/outline"
import { useSelector } from "@tanstack/react-store"
import { useState } from "react"
import type { MessageQuestion } from "@src/shared/conversations"
import { Button } from "../ui/button"
import { chatStore } from "./chat-store"

interface ChatQuestionProps {
  botId: string
  messageId: string
  question: MessageQuestion
  answerValue?: string
  interactive: boolean
  onAnswer: (messageId: string, optionValue: string) => Promise<boolean>
}

export function ChatQuestion({ botId, messageId, question, answerValue, interactive, onAnswer }: ChatQuestionProps) {
  const busy = useSelector(chatStore, (state) => !!state.runs[botId])
  const activeAnswerValue = useSelector(chatStore, (state) => {
    const reply = state.runs[botId]?.message.replyTo

    if (reply?.messageId !== messageId) {
      return
    }

    return reply.optionValue
  })
  const [pendingValue, setPendingValue] = useState<string | undefined>()
  const selectedValue = answerValue ?? activeAnswerValue ?? pendingValue
  const selected = question.options.find((option) => option.value === selectedValue)

  async function choose(value: string) {
    const option = question.options.find((candidate) => candidate.value === value)

    if (!option || selectedValue || busy || !interactive) {
      return
    }

    setPendingValue(value)
    const sent = await onAnswer(messageId, option.value)

    if (!sent) {
      setPendingValue(undefined)
    }
  }

  if (selected) {
    return (
      <div className="mt-3 flex items-center gap-2 text-control text-secondary">
        <CheckIcon className="size-4 shrink-0 text-muted" aria-hidden="true" />
        <span>{selected.label}</span>
      </div>
    )
  }

  const detailed = question.options.some((option) => option.description)
  const layout = detailed ? { list: "flex flex-col gap-2", option: "w-full" } : { list: "flex flex-wrap gap-2", option: "" }

  return (
    <fieldset className="m-0 mt-3 min-w-0 border-0 p-0" disabled={busy || !interactive}>
      <legend className="sr-only">Escolha uma resposta</legend>
      <div className={layout.list}>
        {question.options.map((option) => (
          <Button className={`flex flex-col items-start gap-0.5 text-left ${layout.option}`} key={option.value} variant="secondary" type="button" onClick={() => void choose(option.value)}>
            <span className="text-primary">{option.label}</span>
            {option.description && <span className="text-support font-normal text-muted">{option.description}</span>}
          </Button>
        ))}
        {question.allowOther && <span className="flex items-center py-2.5 text-support text-muted">Ou escreva outra resposta abaixo</span>}
      </div>
    </fieldset>
  )
}
