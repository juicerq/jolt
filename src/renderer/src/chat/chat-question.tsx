import { CheckIcon } from "@heroicons/react/24/outline"
import { useSelector } from "@tanstack/react-store"
import { useState } from "react"
import type { MessageQuestion } from "@src/shared/conversations"
import { Button } from "../ui/button"
import { Select } from "../ui/select"
import { chatStore } from "./chat-store"

interface ChatQuestionProps {
  botId: string
  messageId: string
  question: MessageQuestion
  answerValue?: string
  interactive: boolean
  onAnswer(messageId: string, optionValue: string): Promise<boolean>
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
      <div className="mt-3 flex w-fit items-center gap-2 rounded-lg border border-outline-strong bg-surface-active px-3 py-2 text-control font-medium text-primary">
        <CheckIcon className="size-4 text-secondary" aria-hidden="true" />
        <span>{selected.label}</span>
      </div>
    )
  }

  const disabled = busy || !interactive

  return (
    <fieldset className="m-0 mt-3 min-w-0 border-0 p-0" disabled={disabled}>
      <legend className="sr-only">Escolha uma resposta</legend>
      {question.options.length <= 4
        ? (
          <div className="flex flex-wrap gap-2">
            {question.options.map((option) => (
              <Button className="flex min-w-32 flex-col items-start gap-0.5 text-left" key={option.value} variant="secondary" type="button" onClick={() => void choose(option.value)}>
                <span className="text-primary">{option.label}</span>
                {option.description && <span className="text-support font-normal text-muted">{option.description}</span>}
              </Button>
            ))}
          </div>
        )
        : (
          <Select className="max-w-96" aria-label="Escolha uma resposta" value="" onChange={(event) => void choose(event.target.value)}>
            <option value="" disabled>Escolher uma opção</option>
            {question.options.map((option) => <option key={option.value} value={option.value}>{option.description ? `${option.label} · ${option.description}` : option.label}</option>)}
          </Select>
        )}
      {question.allowOther && <p className="mt-2 mb-0 text-support text-muted">Ou escreva outra resposta abaixo.</p>}
    </fieldset>
  )
}
