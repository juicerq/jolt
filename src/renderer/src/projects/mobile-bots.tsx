import { Bars3Icon, Cog6ToothIcon, ComputerDesktopIcon, PuzzlePieceIcon } from "@heroicons/react/24/outline"
import { useQuery } from "@tanstack/react-query"
import { Store, useSelector } from "@tanstack/react-store"
import type { Bot } from "@src/shared/bots"
import { BotFace } from "../bots/bot-face"
import { openMobileMenu, openPlugins, openSettings, selectBot, toggleBrowserSidebar } from "../bots/bots-store"
import { teamLeaders } from "../bots/team"
import { needsResponse, useConversationOverview } from "../chat/chat-overview"
import { chatStatusClassNames, chatStatusLabels } from "../chat/chat-status"
import type { ChatStatus } from "../chat/chat-store"
import type { EngineClient } from "../engine-client"
import { IconButton } from "../ui/icon-button"
import { BotSearch, CreateMenu } from "./projects-sidebar"

const mobileListStore = new Store({ search: "", pendingOnly: false, scrollTop: 0 })

export function MobileBots({ client }: { client: EngineClient }) {
  const { data, error, isPending } = useQuery(client.query.projects.list.queryOptions())
  const overview = useConversationOverview(client)
  const search = useSelector(mobileListStore, (state) => state.search)
  const pendingOnly = useSelector(mobileListStore, (state) => state.pendingOnly)
  const leaders = teamLeaders(data)
  const pending = leaders.flatMap((bot) => [bot, ...bot.members]).filter((bot) => !bot.closed && needsResponse(overview.status(bot.id))).length
  const query = search.trim().toLocaleLowerCase("pt-BR")
  const groups = [...(data?.projects ?? []), { id: "unassigned", name: "Sem Projeto", bots: data?.unassignedBots ?? [] }]
  const matches = (bot: Bot) => (!pendingOnly || needsResponse(overview.status(bot.id))) && `${bot.name} ${bot.function.outcome}`.toLocaleLowerCase("pt-BR").includes(query)
  const visible = groups.map((group) => ({ ...group, bots: group.bots.filter((bot) => matches(bot) || bot.members.some(matches)) })).filter((group) => group.bots.length > 0)

  return <div className="flex min-h-0 flex-1 flex-col bg-canvas pb-[var(--safe-bottom)]">
    <header className="flex items-center justify-between px-5 pt-4 pb-3"><h1 className="m-0 text-title font-semibold">Seus Bots</h1><div className="flex gap-1"><IconButton label="Mostrar navegadores" onClick={toggleBrowserSidebar}><ComputerDesktopIcon /></IconButton><CreateMenu draftOpen={false} size={34} /></div></header>
    <div className="px-5 pb-3"><BotSearch value={search} onChange={(search) => mobileListStore.setState((state) => ({ ...state, search, scrollTop: 0 }))} /></div>
    <div className="flex gap-2 px-5 pb-4" aria-label="Filtrar Bots">
      <button className={`mobile-filter ${!pendingOnly ? "bg-surface-active text-primary" : "text-secondary"}`} aria-pressed={!pendingOnly} onClick={() => mobileListStore.setState((state) => ({ ...state, pendingOnly: false, scrollTop: 0 }))}>Todos</button>
      <button className={`mobile-filter ${pendingOnly ? "bg-surface-active text-primary" : "text-secondary"}`} aria-pressed={pendingOnly} onClick={() => mobileListStore.setState((state) => ({ ...state, pendingOnly: true, scrollTop: 0 }))}>Precisam de você <span className="ml-1 tabular-nums">{pending}</span></button>
    </div>
    <nav ref={(node) => { if (node) { node.scrollTop = mobileListStore.state.scrollTop } }} onScroll={(event) => { const scrollTop = event.currentTarget.scrollTop; mobileListStore.setState((state) => ({ ...state, scrollTop })) }} className="min-h-0 flex-1 overflow-y-auto px-4" aria-label="Projetos e Bots">
      {(error || overview.error) && <p className="text-support text-status-error" role="alert">Não foi possível atualizar os Bots. Tentaremos ao reconectar.</p>}
      {(isPending || overview.isPending) && <p className="text-support text-secondary">Carregando seus Bots…</p>}
      {!isPending && !error && visible.length === 0 && <p className="px-1 text-body text-secondary">{pendingOnly ? "Nenhum Bot precisa de uma resposta agora." : "Nenhum Bot encontrado. Use o botão Criar para começar."}</p>}
      {visible.map((group) => <section key={group.id} className="mb-6" aria-label={group.name}>
        <h2 className="m-0 px-2 pb-2 text-support font-medium text-muted">{group.name}</h2>
        <ul className="m-0 list-none p-0">{group.bots.map((bot) => {
          const members = bot.members.filter((member) => (!member.closed || query) && (matches(bot) || matches(member)))
          const waiting = bot.members.filter((member) => !member.closed && needsResponse(overview.status(member.id))).length

          return <li key={bot.id}>
            <MobileBotRow bot={bot} members={bot.members.filter((member) => !member.closed)} status={overview.status(bot.id)} preview={overview.byBot[bot.id]?.preview} waiting={waiting} />
            {members.length > 0 && <ul className="mt-1 mb-2 ml-7 list-none border-l border-outline pl-3">{members.map((member) => <li key={member.id}><MobileBotRow bot={member} status={overview.status(member.id)} preview={overview.byBot[member.id]?.preview} /></li>)}</ul>}
          </li>
        })}</ul>
      </section>)}
    </nav>
    <footer className="flex items-center justify-between border-t border-outline px-5 py-3"><IconButton label="Abrir menu" onClick={openMobileMenu}><Bars3Icon /></IconButton><div className="flex gap-2"><IconButton label="Plugins" onClick={openPlugins}><PuzzlePieceIcon /></IconButton><IconButton label="Configurações" onClick={openSettings}><Cog6ToothIcon /></IconButton></div></footer>
  </div>
}

function MobileBotRow({ bot, members = [], status, preview, waiting = 0 }: { bot: Bot; members?: Bot[]; status: ChatStatus; preview?: string; waiting?: number }) {
  const pending = needsResponse(status)
  const detail = preview || (pending ? chatStatusLabels[status] : bot.function.outcome)

  return <button className="flex min-h-20 w-full items-center gap-3 rounded-lg bg-transparent px-2 py-3 text-left hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring active:bg-surface-active" onClick={() => selectBot(bot.id)}>
    <span className="relative flex size-11 shrink-0 items-center">
      <BotFace className={members.length ? "absolute top-0 left-1 size-8" : "size-11"} name={bot.avatarSeed} botId={bot.id} size={members.length ? 32 : 44} />
      {members.slice(0, 2).map((member, index) => <BotFace key={member.id} className={`absolute bottom-0 size-6 ${index === 0 ? "left-0" : "right-0"}`} name={member.avatarSeed} botId={member.id} size={24} />)}
      {!members.length && <span className={`absolute right-0 bottom-0 size-2 rounded-full ${chatStatusClassNames[status]}`} />}
    </span>
    <span className="flex min-w-0 flex-1 flex-col gap-1"><strong className="truncate text-section font-semibold text-primary">{bot.name}</strong><span className={`line-clamp-2 text-support ${pending ? "text-status-awaiting-decision" : "text-secondary"}`}>{detail}</span>{waiting > 0 && <span className="text-support text-status-awaiting-decision">{waiting} {waiting === 1 ? "Integrante precisa" : "Integrantes precisam"} de você</span>}</span>
  </button>
}
