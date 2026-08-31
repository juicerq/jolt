import { Blobatar } from "@blobatar/react"
import { ChevronDownIcon, FolderIcon, MagnifyingGlassIcon, UserPlusIcon } from "@heroicons/react/24/outline"
import { useQuery } from "@tanstack/react-query"
import { useSelector } from "@tanstack/react-store"
import { useState } from "react"
import type { Bot } from "../../../shared/bots"
import type { projectSchemas } from "../../../shared/projects"
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
  const [search, setSearch] = useState("")
  const { data, error, isPending } = useQuery(client.query.projects.list.queryOptions())
  const query = search.trim().toLocaleLowerCase("pt-BR")
  const visibleData = data && query ? filterProjects(data, query) : data
  const hasVisibleBots = !!visibleData && (visibleData.projects.length > 0 || visibleData.unassignedBots.length > 0)

  return (
    <aside className="bots-sidebar conversation-sidebar">
      <div className="bots-sidebar-heading">
        <BotSearch value={search} onChange={setSearch} />
        <div className="sidebar-create-actions">
          <IconButton type="button" label="Criar projeto" onClick={openCreateProject}><FolderIcon aria-hidden="true" /></IconButton>
          <IconButton type="button" label="Criar bot" onClick={openCreateBot}><UserPlusIcon aria-hidden="true" /></IconButton>
        </div>
      </div>
      {error && <p className="error sidebar-state">Falha ao carregar Projetos: {error.message}</p>}
      {isPending && <p className="empty sidebar-state">Carregando Projetos...</p>}
      {data && data.projects.length === 0 && data.unassignedBots.length === 0 && <div className="bots-empty"><strong>Nenhum Bot</strong><span>Crie um Bot ou Projeto para começar.</span></div>}
      {data && query && !hasVisibleBots && <div className="bots-empty"><strong>Nenhum Bot encontrado</strong><span>Tente outro nome ou função.</span></div>}
      {visibleData && hasVisibleBots && (
        <nav className="project-groups conversation-list" aria-label="Projetos e Bots">
          {visibleData.projects.map((project) => (
            <section className="project-group" key={project.id} aria-labelledby={`project-${project.id}`}>
              <div className="project-group-heading"><h3 id={`project-${project.id}`}>{project.name}</h3></div>
              {project.bots.length === 0
                ? <p className="project-empty">Nenhum Bot</p>
                : <ul className="bots-list">{project.bots.map((bot) => <BotGroup bot={bot} key={bot.id} selectedBotId={selectedBotId} statuses={statuses} />)}</ul>}
            </section>
          ))}
          {visibleData.unassignedBots.length > 0 && (
            <section className="project-group unassigned-group" aria-labelledby="unassigned-bots">
              <div className="project-group-heading"><h3 id="unassigned-bots">Sem projeto</h3></div>
              <ul className="bots-list">{visibleData.unassignedBots.map((bot) => <BotGroup bot={bot} key={bot.id} selectedBotId={selectedBotId} statuses={statuses} />)}</ul>
            </section>
          )}
        </nav>
      )}
    </aside>
  )
}

function BotSearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="bots-search">
      <MagnifyingGlassIcon aria-hidden="true" />
      <input type="search" aria-label="Buscar Bots" placeholder="Buscar Bots" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

function filterProjects(data: typeof projectSchemas.groupedList.infer, query: string) {
  const filterBots = (bots: (Bot & { members: Bot[] })[]) => bots.flatMap((bot) => {
    const leaderMatches = matchesSearch(bot, query)
    const matchingMembers = bot.members.filter((member) => matchesSearch(member, query))

    if (!leaderMatches && matchingMembers.length === 0) {
      return []
    }

    return [{ ...bot, members: leaderMatches ? bot.members : matchingMembers }]
  })

  return {
    projects: data.projects
      .map((project) => ({ ...project, bots: filterBots(project.bots) }))
      .filter((project) => project.bots.length > 0),
    unassignedBots: filterBots(data.unassignedBots),
  }
}

function matchesSearch(bot: Bot, query: string) {
  return `${bot.name} ${bot.function.outcome}`.toLocaleLowerCase("pt-BR").includes(query)
}

function BotGroup({ bot, selectedBotId, statuses }: { bot: Bot & { members: Bot[] }; selectedBotId: string | null; statuses: Record<string, ChatStatus | undefined> }) {
  const hasTeam = bot.members.length > 0
  const [expanded, setExpanded] = useState(hasTeam)
  const memberListId = `team-members-${bot.id}`

  if (!hasTeam) {
    return <li className="bot-group"><BotRow bot={bot} selected={selectedBotId === bot.id} status={statuses[bot.id] ?? "available"} /></li>
  }

  return (
    <li className={`bot-group team-bot-group ${expanded ? "expanded" : "collapsed"}`}>
      <div className="team-leader-row">
        <BotRow bot={bot} members={expanded ? undefined : bot.members} teamLeader selected={selectedBotId === bot.id} status={statuses[bot.id] ?? "available"} />
        <IconButton
          className="team-toggle"
          type="button"
          label={expanded ? `Recolher time de ${bot.name}` : `Expandir time de ${bot.name}`}
          aria-expanded={expanded}
          aria-controls={memberListId}
          onClick={() => setExpanded((current) => !current)}
        >
          <ChevronDownIcon aria-hidden="true" />
        </IconButton>
      </div>
      <div className="member-bots-disclosure" id={memberListId} aria-hidden={!expanded} inert={!expanded ? true : undefined}>
        <ul className="member-bots-list" aria-label={`Integrantes de ${bot.name}`}>
          {bot.members.map((member) => <li key={member.id}><BotRow bot={member} member selected={selectedBotId === member.id} status={statuses[member.id] ?? "available"} /></li>)}
        </ul>
      </div>
    </li>
  )
}

function BotRow({ bot, member = false, members, selected, status, teamLeader = false }: { bot: Bot; member?: boolean; members?: Bot[]; selected: boolean; status: ChatStatus; teamLeader?: boolean }) {
  const avatarClasses = ["bot-avatar-status", members?.length ? "has-team" : "", teamLeader ? "team-leader-avatar" : ""].filter(Boolean).join(" ")

  return (
    <button className={`${selected ? "bot-list-button conversation-button selected" : "bot-list-button conversation-button"}${member ? " member-bot-button" : ""}`} type="button" onClick={() => selectBot(bot.id)}>
      <span className={avatarClasses} role="img" aria-label={`Status: ${chatStatusLabels[status]}`} data-tooltip={chatStatusLabels[status]} data-tooltip-placement="top">
        <BotAvatar bot={bot} members={members} />
        <span className={`chat-status-dot ${status}`} aria-hidden="true" />
      </span>
      <span className="conversation-copy"><strong>{bot.name}</strong><small>{bot.function.outcome}</small></span>
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
