import { NoSymbolIcon } from "@heroicons/react/24/outline"
import type { TurnEnding } from "../../../shared/conversations"

const labels: Record<TurnEnding, (botName: string) => string> = {
  aborted: (botName) => `Você interrompeu ${botName}`,
  failed: (botName) => `${botName} parou por um erro`,
  closed: (botName) => `O app fechou durante a resposta de ${botName}`,
}

export function ChatTurnEnding({ botName, ending }: { botName: string; ending: TurnEnding }) {
  return (
    <p className="m-0 grid w-fit grid-cols-[16px_auto] items-center gap-[7px] px-[7px] py-[5px] text-support text-muted [&_svg]:stroke-[1.75]">
      <NoSymbolIcon className="size-4" aria-hidden="true" />
      <span>{labels[ending](botName)}</span>
    </p>
  )
}
