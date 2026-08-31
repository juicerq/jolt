import { useSelector } from "@tanstack/react-store"
import { CreateProjectDialog } from "../projects/create-project-dialog"
import { ProjectsSidebar } from "../projects/projects-sidebar"
import type { EngineClient } from "../engine-client"
import { BotChat } from "./bot-chat"
import { botsStore } from "./bots-store"
import { CreateBotDialog } from "./create-bot-dialog"

export function BotsWorkspace({ client }: { client: EngineClient }) {
  const dialog = useSelector(botsStore, (state) => state.dialog)
  const selectedBotId = useSelector(botsStore, (state) => state.selectedBotId)

  return (
    <section className="bots-workspace" aria-label="Bots">
      <ProjectsSidebar client={client} />
      <div className="bot-content"><BotChat key={selectedBotId ?? "no-bot"} client={client} botId={selectedBotId} /></div>
      {dialog === "create-bot" && <CreateBotDialog client={client} />}
      {dialog === "create-project" && <CreateProjectDialog client={client} />}
    </section>
  )
}
