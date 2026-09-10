import type { Bot } from "@src/shared/bots"
import { BotPageIcon } from "./bot-page-icon"
import { botRouteTitles, type BotPageName } from "./bot-route-titles"

export function BotPageHeader({ bot, page, title = botRouteTitles[page] }: { bot: Pick<Bot, "name" | "avatarSeed">; page: BotPageName; title?: string }) {
  return (
    <header className="flex items-center gap-4">
      <BotPageIcon page={page} seed={bot.avatarSeed} />
      <div className="min-w-0 flex-1">
        <h2 className="m-0 break-words text-title font-semibold text-primary">{title}</h2>
        <p className="m-0 mt-1 break-words text-control font-medium text-secondary">{bot.name}</p>
      </div>
    </header>
  )
}
