import { useSelector } from "@tanstack/react-store"
import { PluginsScreen } from "../plugins/plugins-screen"
import { MobileMenu } from "../projects/mobile-menu"
import { MobileBots } from "../projects/mobile-bots"
import { useIsMobile } from "../ui/use-is-mobile"
import { ConnectionBanner } from "../connection"
import { CreateProjectDialog } from "../projects/create-project-dialog"
import { ProjectsSidebar } from "../projects/projects-sidebar"
import { SettingsScreen } from "../settings/settings-screen"
import type { EngineClient } from "../engine-client"
import { BotChat } from "./bot-chat"
import { botsStore } from "./bots-store"
import { NewBot } from "./new-bot"
import { WorkspaceTopBar } from "./workspace-top-bar"

export function BotsWorkspace({ client }: { client: EngineClient }) {
  const dialog = useSelector(botsStore, (state) => state.dialog)
  const selectedBotId = useSelector(botsStore, (state) => state.selectedBotId)
  const draft = useSelector(botsStore, (state) => state.draft)
  const screen = useSelector(botsStore, (state) => state.screen)
  const mobileList = useSelector(botsStore, (state) => state.mobileList)
  const mobile = useIsMobile()

  function workspaceContent() {
    if (screen === "plugins") {
      return <PluginsScreen client={client} />
    }

    if (screen === "settings") {
      return <SettingsScreen client={client} />
    }

    if (draft) {
      return <NewBot client={client} draft={draft} />
    }

    return <BotChat key={selectedBotId ?? "no-bot"} client={client} botId={selectedBotId} />
  }

  return (
    <section className="grid size-full min-h-0 grid-cols-[286px_minmax(0,1fr)] gap-3 overflow-hidden bg-canvas py-3 pr-3 max-md:grid-cols-1 max-md:gap-0 max-md:p-0" aria-label="Bots">
      {!mobile && <ProjectsSidebar client={client} />}
      <MobileMenu client={client} />
      <div className="relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-shell border border-outline bg-surface max-md:rounded-none max-md:border-0 max-md:pt-[var(--safe-top)]">
        <ConnectionBanner />
        {mobile && mobileList ? <MobileBots client={client} /> : <>
          {mobile && <WorkspaceTopBar client={client} />}
          <div className="relative min-h-0 min-w-0 flex-1">{workspaceContent()}</div>
        </>}
      </div>
      {dialog === "create-project" && <CreateProjectDialog client={client} />}
    </section>
  )
}
