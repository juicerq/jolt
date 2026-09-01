import { useSelector } from "@tanstack/react-store"
import { CreateProjectDialog } from "../projects/create-project-dialog"
import { ProjectsSidebar } from "../projects/projects-sidebar"
import type { EngineClient } from "../engine-client"
import { BotChat } from "./bot-chat"
import { botsStore } from "./bots-store"
import { NewBot } from "./new-bot"

export function BotsWorkspace({ client }: { client: EngineClient }) {
  const dialog = useSelector(botsStore, (state) => state.dialog)
  const selectedBotId = useSelector(botsStore, (state) => state.selectedBotId)
  const draft = useSelector(botsStore, (state) => state.draft)

  return (
    <section className="grid size-full min-h-0 grid-cols-[286px_minmax(0,1fr)] gap-3 overflow-hidden bg-canvas py-3 pr-3 max-[720px]:grid-cols-[88px_minmax(0,1fr)] max-[720px]:gap-2 max-[720px]:py-2 max-[720px]:pr-2" aria-label="Bots">
      <ProjectsSidebar client={client} />
      <div className="relative min-h-0 min-w-0 overflow-hidden rounded-shell border border-outline bg-surface">{draft ? <NewBot client={client} /> : <BotChat key={selectedBotId ?? "no-bot"} client={client} botId={selectedBotId} />}</div>
      {dialog === "create-project" && <CreateProjectDialog client={client} />}
    </section>
  )
}
