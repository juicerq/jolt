import { CheckIcon as CheckSolidIcon } from "@heroicons/react/16/solid"
import { CheckIcon } from "@heroicons/react/24/outline"
import { useSelector } from "@tanstack/react-store"
import { useState } from "react"
import type { MessageQuestion } from "@src/shared/conversations"
import { connectionStore } from "../connection"
import { Button } from "../ui/button"
import { chatStore } from "./chat-store"

export type QuestionAnswer = (messageId: string, optionValues: string[]) => Promise<boolean>

interface ChatQuestionProps {
  botId: string
  messageId: string
  question: MessageQuestion
  answerValues?: string[]
  interactive: boolean
  onAnswer: QuestionAnswer
}

export function ChatQuestion({ botId, messageId, question, answerValues, interactive, onAnswer }: ChatQuestionProps) {
  const connected = useSelector(connectionStore, (state) => state.connected)
  const busy = useSelector(chatStore, (state) => !!state.runs[botId])
  const activeAnswerValues = useSelector(chatStore, (state) => {
    const reply = state.runs[botId]?.message.replyTo

    if (reply?.messageId !== messageId) {
      return
    }

    return reply.optionValues
  })
  const [pendingValues, setPendingValues] = useState<string[]>()
  const [marked, setMarked] = useState<string[]>([])
  const answered = answerValues ?? activeAnswerValues ?? pendingValues
  const disabled = busy || !interactive || !connected

  async function answer(values: string[]) {
    if (answered || disabled) {
      return
    }

    setPendingValues(values)
    const sent = await onAnswer(messageId, values)

    if (!sent) {
      setPendingValues(undefined)
    }
  }

  function handleOption(value: string) {
    if (!question.multiple) {
      void answer([value])

      return
    }

    setMarked((current) => current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value])
  }

  if (answered) {
    return (
      <div className="mt-3 flex items-center gap-2 text-control text-secondary">
        <CheckIcon className="size-4 shrink-0 text-muted" aria-hidden="true" />
        <span>{question.options.filter((option) => answered.includes(option.value)).map((option) => option.label).join(", ")}</span>
      </div>
    )
  }

  const detailed = question.options.some((option) => option.description)
  const layout = detailed ? { list: "flex flex-col gap-2", option: "w-full" } : { list: "flex flex-wrap gap-2", option: "" }
  const otherHint = question.allowOther && <span className="flex items-center py-2.5 text-support text-muted">Ou escreva outra resposta abaixo</span>

  return (
    <fieldset className="m-0 mt-3 min-w-0 border-0 p-0" disabled={disabled}>
      <legend className="sr-only">{question.multiple ? "Escolha uma ou mais respostas" : "Escolha uma resposta"}</legend>
      <div className={layout.list}>
        {question.options.map((option) => {
          const pressed = question.multiple && marked.includes(option.value)

          return (
            <Button className={`flex items-start gap-2 text-left ${layout.option} ${pressed ? "border-focus bg-surface-active" : ""}`} key={option.value} variant="secondary" type="button" {...(question.multiple ? { "aria-pressed": pressed } : {})} onClick={() => handleOption(option.value)}>
              {question.multiple && (
                <span className={`mt-px flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors duration-150 motion-reduce:transition-none ${pressed ? "border-accent bg-accent text-accent-ink" : "border-outline-strong bg-transparent text-transparent"}`} aria-hidden="true">
                  <CheckSolidIcon className="size-3" />
                </span>
              )}
              <span className="flex flex-col items-start gap-0.5">
                <span className="text-primary">{option.label}</span>
                {option.description && <span className="text-support font-normal text-muted">{option.description}</span>}
              </span>
            </Button>
          )
        })}
        {!question.multiple && otherHint}
      </div>
      {question.multiple && (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Button type="button" disabled={marked.length === 0} onClick={() => void answer(marked)}>Enviar</Button>
          {otherHint}
        </div>
      )}
    </fieldset>
  )
}
