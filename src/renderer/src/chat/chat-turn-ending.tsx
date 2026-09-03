import { NoSymbolIcon } from "@heroicons/react/24/outline"
import type { TurnEnding } from "../../../shared/conversations"

const labels: Record<TurnEnding, (botName: string) => string> = {
  aborted: (botName) => `Você interrompeu ${botName}`,
  failed: (botName) => `${botName} parou por um erro`,
  closed: (botName) => `O app fechou durante a resposta de ${botName}`,
}

export function ChatTurnEnding({ botName, ending, error }: { botName: string; ending: TurnEnding; error?: string }) {
  const detail = ending === "failed" && error ? `: ${error}` : ""

  return (
    <p className="m-0 mt-3 grid w-fit max-w-[720px] grid-cols-[16px_auto] items-center gap-[7px] text-support text-muted [&_svg]:stroke-[1.75]">
      <NoSymbolIcon className="size-4" aria-hidden="true" />
      <span>{labels[ending](botName)}{detail}</span>
    </p>
  )
}
