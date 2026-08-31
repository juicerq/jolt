import { Blobatar } from "@blobatar/react"
import { FolderIcon, UserPlusIcon } from "@heroicons/react/24/outline"
import { useQuery } from "@tanstack/react-query"
import { useSelector } from "@tanstack/react-store"
import type { Bot } from "../../../shared/bots"
import { botsStore, openCreateBot, openCreateProject, selectBot } from "../bots/bots-store"
import { chatStore, type ChatStatus } from "../chat/chat-store"
import type { EngineClient } from "../engine-client"
import { IconButton } from "../ui/icon-button"

const chatStatusLabels: Record<ChatStatus, string> = {
  available: "Disponível",
  working: "Trabalhando",
  waiting: "Interrompendo",
  completed: "Concluído",
  error: "Erro",
}

export function ProjectsSidebar({ client }: { client: EngineClient }) {
  const selectedBotId = useSelector(botsStore, (state) => state.selectedBotId)
  const statuses = useSelector(chatStore, (state) => state.statuses)
  const { data, error, isPending } = useQuery(client.query.projects.list.queryOptions())

  return (
    <aside className="bots-sidebar conversation-sidebar">
      <div className="bots-sidebar-heading">
        <h2>Bots</h2>
        <div className="sidebar-create-actions">
          <IconButton type="button" label="Criar projeto" onClick={openCreateProject}><FolderIcon aria-hidden="true" /></IconButton>
          <IconButton type="button" label="Criar bot" onClick={openCreateBot}><UserPlusIcon aria-hidden="true" /></IconButton>
        </div>
      </div>
      {error && <p className="error sidebar-state">Falha ao carregar Projetos: {error.message}</p>}
      {isPending && <p className="empty sidebar-state">Carregando Projetos...</p>}
      {data && data.projects.length === 0 && data.unassignedBots.length === 0 && <div className="bots-empty"><strong>Nenhum Bot</strong><span>Crie um Bot ou Projeto para começar.</span></div>}
      {data && (
        <nav className="project-groups conversation-list" aria-label="Projetos e Bots">
          {data.projects.map((project) => (
            <section className="project-group" key={project.id} aria-labelledby={`project-${project.id}`}>
              <div className="project-group-heading"><h3 id={`project-${project.id}`}>{project.name}</h3></div>
              {project.bots.length === 0
                ? <p className="project-empty">Nenhum Bot</p>
                : <ul className="bots-list">{project.bots.map((bot) => <BotGroup bot={bot} key={bot.id} selectedBotId={selectedBotId} statuses={statuses} />)}</ul>}
            </section>
          ))}
          {data.unassignedBots.length > 0 && (
            <section className="project-group unassigned-group" aria-labelledby="unassigned-bots">
              <div className="project-group-heading"><h3 id="unassigned-bots">Sem projeto</h3></div>
              <ul className="bots-list">{data.unassignedBots.map((bot) => <BotGroup bot={bot} key={bot.id} selectedBotId={selectedBotId} statuses={statuses} />)}</ul>
            </section>
          )}
        </nav>
      )}
    </aside>
  )
}

function BotGroup({ bot, selectedBotId, statuses }: { bot: Bot & { members: Bot[] }; selectedBotId: string | null; statuses: Record<string, ChatStatus | undefined> }) {
  return (
    <li className={bot.members.length > 0 ? "bot-group team-bot-group" : "bot-group"}>
      <BotRow bot={bot} members={bot.members} selected={selectedBotId === bot.id} status={statuses[bot.id] ?? "available"} />
      {bot.members.length > 0 && (
        <ul className="member-bots-list" aria-label={`Integrantes de ${bot.name}`}>
          {bot.members.map((member) => <li key={member.id}><BotRow bot={member} member selected={selectedBotId === member.id} status={statuses[member.id] ?? "available"} /></li>)}
        </ul>
      )}
    </li>
  )
}

function BotRow({ bot, member = false, members, selected, status }: { bot: Bot; member?: boolean; members?: Bot[]; selected: boolean; status: ChatStatus }) {
  return (
    <button className={`${selected ? "bot-list-button conversation-button selected" : "bot-list-button conversation-button"}${member ? " member-bot-button" : ""}`} type="button" onClick={() => selectBot(bot.id)}>
      <BotAvatar bot={bot} members={members} />
      <span className="conversation-copy"><strong>{bot.name}</strong><small><span className={`chat-status-dot ${status}`} />{chatStatusLabels[status]} · {bot.function.outcome}</small></span>
    </button>
  )
}

function BotAvatar({ bot, members }: { bot: Bot; members?: Bot[] }) {
  if (!members || members.length === 0) {
    return <Blobatar className="bot-avatar" name={`jots:${bot.id}:${bot.name}`} size={32} alt="" />
  }

  const avatars = [bot, ...members].slice(0, 3)

  return <span className="team-avatar-stack" role="img" aria-label={`${bot.name} lidera ${members.length} integrantes`}>{avatars.map((avatar) => <Blobatar className="bot-avatar" name={`jots:${avatar.id}:${avatar.name}`} size={24} alt="" key={avatar.id} />)}</span>
}
