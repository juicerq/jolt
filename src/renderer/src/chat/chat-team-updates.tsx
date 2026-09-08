import { ChevronRightIcon } from "@heroicons/react/24/outline"
import { useState } from "react"
import type { Bot } from "@src/shared/bots"
import { BotFace } from "../bots/bot-face"
import { selectBot } from "../bots/bots-store"
import type { EngineClient } from "../engine-client"
import { needsResponse, useConversationOverview } from "./chat-overview"
import { chatVisits } from "./chat-visits"
import { chatStatusLabels } from "./chat-status"

export function ChatTeamUpdates({ bot, members, client }: { bot: Bot; members: Bot[]; client: EngineClient }) {
  const overview = useConversationOverview(client)
  const [lastVisit] = useState(() => chatVisits.last(bot.id))
  const relevant = members.filter((member) => {
    const status = overview.status(member.id)
    const entry = overview.byBot[member.id]

    return !member.closed && (needsResponse(status) || status === "working" || (entry && (!lastVisit || entry.createdAt > lastVisit)))
  })

  if (relevant.length === 0) {
    return null
  }

  return <section className="mb-2 rounded-lg border border-outline px-3 py-3" aria-label="Novidades do Time">
    <h2 className="m-0 mb-1 text-support font-medium text-secondary">{lastVisit ? "Para retomar com seu Time" : "Seu Time"}</h2>
    {relevant.map((member) => {
      const status = overview.status(member.id)
      const pending = needsResponse(status)
      const entry = overview.byBot[member.id]

      return <button className="flex min-h-16 w-full items-center gap-2 rounded-lg py-2 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" key={member.id} onClick={() => selectBot(member.id)}>
        <BotFace className="size-7 shrink-0" name={member.avatarSeed} botId={member.id} size={28} />
        <span className="flex min-w-0 flex-1 flex-col gap-1"><strong className="text-control font-semibold text-primary">{member.name}</strong><span className={`line-clamp-2 text-support ${pending ? "text-status-awaiting-decision" : "text-secondary"}`}>{pending ? `Responder · ${entry?.preview || chatStatusLabels[status]}` : entry?.preview || chatStatusLabels[status]}</span></span><ChevronRightIcon className="size-4 shrink-0 text-muted" />
      </button>
    })}
  </section>
}
