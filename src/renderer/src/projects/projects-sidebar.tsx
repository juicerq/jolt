import { ArrowPathIcon, BookmarkIcon, ChevronDownIcon, Cog6ToothIcon, FolderIcon, MagnifyingGlassIcon, PlusIcon, PuzzlePieceIcon, TrashIcon, UserPlusIcon } from "@heroicons/react/24/outline"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useSelector } from "@tanstack/react-store"
import { type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode, type Ref, useId, useRef, useState } from "react"
import type { Bot } from "@src/shared/bots"
import type { ProjectGroups } from "@src/shared/projects"
import { BotFace } from "../bots/bot-face"
import { groupMembers } from "../bots/bot-members"
import { botDraftAvatarSeed, type BotDraft, botsStore, forgetBot, openCreateBot, openCreateProject, openPlugins, openSettings, selectBot } from "../bots/bots-store"
import { chatControlAnchor } from "../chat/chat-control-menu"
import { chatStatusClassNames, chatStatusLabels } from "../chat/chat-status"
import { chatStore, type ChatStatus } from "../chat/chat-store"
import type { EngineClient } from "../engine-client"
import { appUpdateStore } from "../settings/app-update-store"
import { Button } from "../ui/button"
import { ConfirmationDialog } from "../ui/dialog"
import { IconButton } from "../ui/icon-button"
import { InlineAction } from "../ui/inline-action"
import { menuCardClassName, MenuOption } from "../ui/menu"
import { Tooltip, useTooltip } from "../ui/tooltip"

const teamAvatarFaceClassName = "shrink-0 text-support font-extrabold text-focus transition-transform duration-[160ms] ease-out motion-reduce:transition-none"
type TogglePinned = (bot: Bot) => void

export function ProjectsSidebar({ client, mobile = false }: { client: EngineClient; mobile?: boolean }) {
  const draft = useSelector(botsStore, (state) => state.draft)
  const pluginsOpen = useSelector(botsStore, (state) => state.screen === "plugins")
  const settingsOpen = useSelector(botsStore, (state) => state.screen === "settings")
  const [search, setSearch] = useState("")

  return (
    <aside className={`flex min-h-0 min-w-0 flex-col bg-sidebar pt-3 pb-2.5 pl-3 ${mobile ? "flex-1 pr-3" : "pr-0 max-md:hidden"}`}>
      <div className="mb-3 flex min-h-9 items-center justify-between gap-2">
        <BotSearch value={search} onChange={setSearch} />
        <CreateMenu />
      </div>
      {draft && <DraftRow draft={draft} />}
      <SidebarProjects client={client} search={search} />
      <div className="mt-auto flex flex-col gap-1 pt-2">
        <SidebarUpdateButton />
        <SidebarNavButton active={pluginsOpen} icon={<PuzzlePieceIcon className="size-4 shrink-0" aria-hidden="true" />} label="Plugins" onClick={openPlugins} />
        <SidebarNavButton active={settingsOpen} icon={<Cog6ToothIcon className="size-4 shrink-0" aria-hidden="true" />} label="Configurações" onClick={openSettings} />
      </div>
    </aside>
  )
}

function SidebarProjects({ client, search }: { client: EngineClient; search: string }) {
  const selectedBotId = useSelector(botsStore, (state) => (state.draft === null && state.screen === null ? state.selectedBotId : null))
  const draftOpen = useSelector(botsStore, (state) => state.draft !== null)
  const statuses = useSelector(chatStore, (state) => state.statuses)
  const queryClient = useQueryClient()
  const { data, error, isPending } = useQuery(client.query.projects.list.queryOptions())
  const { mutate: updatePinned, variables: pinning, isPending: pinningPending, error: pinError } = useMutation(client.query.bots.updatePinned.mutationOptions({
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: client.query.projects.list.queryOptions().queryKey })
    },
  }))

  function togglePinned(bot: Bot) {
    updatePinned({ id: bot.id, pinned: !bot.pinned })
  }

  if (error) {
    return <p className="mx-2.5 my-3 text-support text-status-error">Falha ao carregar Projetos: {error.message}</p>
  }

  if (isPending) {
    return <p className="mx-2.5 my-3 text-support text-secondary">Carregando Projetos...</p>
  }

  const hasBots = data.projects.length > 0 || data.unassignedBots.length > 0

  if (!hasBots && draftOpen) {
    return null
  }

  if (!hasBots) {
    return <SidebarEmpty title="Nenhum Bot"><InlineAction type="button" onClick={openCreateBot}>Crie um Bot</InlineAction> ou Projeto para começar.</SidebarEmpty>
  }

  const query = search.trim().toLocaleLowerCase("pt-BR")
  const visibleData = query ? filterProjects(data, query) : data

  if (visibleData.projects.length === 0 && visibleData.unassignedBots.length === 0) {
    return <SidebarEmpty title="Nenhum Bot encontrado">Tente outro nome ou função.</SidebarEmpty>
  }

  const { pinnedBots, projects, unassignedBots } = splitPinnedBots(visibleData)

  return (
    <nav className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto max-[720px]:block" aria-label="Projetos e Bots">
      {pinError && <p className="mx-2.5 my-3 text-support text-status-error" role="alert">Não foi possível atualizar o Bot: {pinError.message}</p>}
      {pinnedBots.length > 0 && (
        <section className="[&+&]:mt-5" aria-labelledby="pinned-bots">
          <ProjectHeading id="pinned-bots">Fixados</ProjectHeading>
          <ul className="m-0 list-none p-0 max-[720px]:block">
            {pinnedBots.map((bot) => (
              <BotGroup bot={bot} client={client} key={bot.id} selectedBotId={selectedBotId} statuses={statuses} pinningBotId={pinningPending ? pinning?.id : undefined} onTogglePinned={togglePinned} />
            ))}
          </ul>
        </section>
      )}
      {projects.map((project) => <ProjectSection client={client} key={project.id} project={project} selectedBotId={selectedBotId} statuses={statuses} pinningBotId={pinningPending ? pinning?.id : undefined} onTogglePinned={togglePinned} />)}
      {unassignedBots.length > 0 && (
        <section className="[&+&]:mt-5 [&+&]:border-t [&+&]:border-outline [&+&]:pt-4" aria-label="Sem projeto">
          {(projects.length > 0 || pinnedBots.length > 0) && <ProjectHeading id="unassigned-bots">Sem projeto</ProjectHeading>}
          <ul className="m-0 list-none p-0 max-[720px]:block">
            {unassignedBots.map((bot) => (
              <BotGroup bot={bot} client={client} key={bot.id} selectedBotId={selectedBotId} statuses={statuses} pinningBotId={pinningPending ? pinning?.id : undefined} onTogglePinned={togglePinned} />
            ))}
          </ul>
        </section>
      )}
    </nav>
  )
}

function ProjectSection({ client, project, selectedBotId, statuses, pinningBotId, onTogglePinned }: { client: EngineClient; project: ProjectGroups["projects"][number]; selectedBotId: string | null; statuses: Record<string, ChatStatus | undefined>; pinningBotId?: string; onTogglePinned: TogglePinned }) {
  return (
    <section className="[&+&]:mt-5" aria-labelledby={`project-${project.id}`}>
      <ProjectHeading id={`project-${project.id}`}>{project.name}</ProjectHeading>
      {project.bots.length === 0 ? (
        <p className="m-0 px-2.5 pt-[7px] pb-[9px] text-support text-muted">Nenhum Bot</p>
      ) : (
        <ul className="m-0 list-none p-0 max-[720px]:block">
          {project.bots.map((bot) => (
            <BotGroup bot={bot} client={client} key={bot.id} selectedBotId={selectedBotId} statuses={statuses} pinningBotId={pinningBotId} onTogglePinned={onTogglePinned} />
          ))}
        </ul>
      )}
    </section>
  )
}

const createPopoverClassName = `${menuCardClassName} chat-control-popover inset-auto mt-1 [position-area:bottom_span-left] [position-try-fallbacks:flip-block,flip-inline]`

/** A "+" that opens Novo Bot / Novo Projeto: a dropdown on desktop, a sheet on mobile. */
export function CreateMenu({ size = 28 }: { size?: 28 | 34 }) {
  const draftOpen = useSelector(botsStore, (state) => state.draft !== null)
  const popoverId = `create-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`
  const anchor = chatControlAnchor(popoverId)

  return (
    <>
      <span className="grid" style={anchor.trigger}>
        <IconButton className={draftOpen ? "bg-surface-active text-primary" : ""} iconSize={16} size={size} type="button" label="Criar" aria-pressed={draftOpen} popoverTarget={popoverId}>
          <PlusIcon aria-hidden="true" />
        </IconButton>
      </span>
      <div className={createPopoverClassName} id={popoverId} popover="auto" aria-label="Criar" style={anchor.popover}>
        <MenuOption icon={<UserPlusIcon className="size-4 shrink-0 text-muted" aria-hidden="true" />} label="Novo Bot" selected={false} onSelect={openCreateBot} />
        <MenuOption icon={<FolderIcon className="size-4 shrink-0 text-muted" aria-hidden="true" />} label="Novo Projeto" selected={false} onSelect={openCreateProject} />
      </div>
    </>
  )
}

function SidebarUpdateButton() {
  const updateReady = useSelector(appUpdateStore, (state) => state.updateReady)

  if (!updateReady) {
    return null
  }

  return (
    <Button className="flex h-9 w-full items-center gap-2.5 px-2.5 py-0 max-md:h-11" type="button" onClick={() => window.desktop.installUpdate()}>
      <ArrowPathIcon className="size-4 shrink-0" aria-hidden="true" />
      Atualizar e reiniciar
    </Button>
  )
}

function SidebarNavButton({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      className={`flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-control font-medium transition-colors duration-150 hover:bg-surface-hover hover:text-primary focus-visible:bg-surface-hover focus-visible:text-primary focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none active:bg-surface-active ${active ? "bg-surface-raised text-primary" : "bg-transparent text-muted"}`}
      type="button"
      aria-pressed={active}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  )
}

function DraftRow({ draft }: { draft: BotDraft }) {
  return (
    <div className="mb-0.5 flex items-center gap-2.5 rounded-lg border border-outline bg-surface-raised px-2.5 py-2.5 text-primary" aria-current="true">
      <BotFace className="size-[38px] min-w-[38px]" name={botDraftAvatarSeed(draft)} size={38} />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-control font-semibold text-primary">{draft.name || "Novo Bot"}</strong>
        <small className="text-metadata font-medium text-muted">Em rascunho</small>
      </span>
    </div>
  )
}

function SidebarEmpty({ children, title }: { children: ReactNode; title: string }) {
  return (
    <div className="flex min-h-45 flex-col items-center justify-center gap-1.5 text-center text-support text-secondary">
      <strong className="text-section font-semibold text-primary">{title}</strong>
      <span>{children}</span>
    </div>
  )
}

function ProjectHeading({ children, id }: { children: string; id: string }) {
  return (
    <div className="flex items-center justify-between gap-2 px-2.5 pb-1.5">
      <h3 className="m-0 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-metadata font-semibold tracking-[0.08em] text-muted uppercase" id={id}>
        {children}
      </h3>
    </div>
  )
}

export function BotSearch({ value, onChange, ref }: { value: string; onChange: (value: string) => void; ref?: Ref<HTMLInputElement> }) {
  return (
    <label className="relative flex min-w-0 flex-1 items-center">
      <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 size-[15px] text-muted" aria-hidden="true" />
      <input
        className="box-border h-8 w-full rounded-lg border border-outline bg-canvas py-0 pr-2.5 pl-8 text-control text-primary placeholder:text-muted hover:border-outline-strong focus-visible:border-focus focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none max-md:h-9 max-md:text-base"
        type="search"
        aria-label="Buscar Bots"
        placeholder="Buscar Bots"
        ref={ref}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

function filterProjects(data: ProjectGroups, query: string) {
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

function splitPinnedBots(data: ProjectGroups) {
  const pinnedBots: (Bot & { members: Bot[] })[] = []
  const split = (bots: (Bot & { members: Bot[] })[]) => bots.flatMap((bot) => {
    if (bot.pinned) {
      pinnedBots.push(bot)

      return []
    }

    const pinnedMembers = bot.members.filter((member) => member.pinned).map((member) => ({ ...member, members: [] }))
    pinnedBots.push(...pinnedMembers)

    return [{ ...bot, members: bot.members.filter((member) => !member.pinned) }]
  })
  const projects = data.projects.flatMap((project) => {
    const bots = split(project.bots)

    if (project.bots.length > 0 && bots.length === 0) {
      return []
    }

    return [{ ...project, bots }]
  })

  return { pinnedBots, projects, unassignedBots: split(data.unassignedBots) }
}

function BotGroup({ bot, client, selectedBotId, statuses, pinningBotId, onTogglePinned }: { bot: Bot & { members: Bot[] }; client: EngineClient; selectedBotId: string | null; statuses: Record<string, ChatStatus | undefined>; pinningBotId?: string; onTogglePinned: TogglePinned }) {
  const hasTeam = bot.members.length > 0
  const [expanded, setExpanded] = useState(hasTeam)
  const [closedShown, setClosedShown] = useState(false)
  const memberListId = `team-members-${bot.id}`
  const closedListId = `team-closed-${bot.id}`
  const groups = groupMembers(bot.members)
  const openMembers = [...groups.permanent, ...groups.active]
  const memberSelected = bot.members.some((member) => member.id === selectedBotId)
  const highlighted = !expanded && memberSelected ? bot.id : selectedBotId

  if (!hasTeam) {
    return <li className="block border-0 p-0"><BotRow bot={bot} selected={selectedBotId === bot.id} status={statuses[bot.id] ?? "available"} pinning={pinningBotId === bot.id} onTogglePinned={onTogglePinned} /></li>
  }

  return (
    <li className="block border-0 p-0">
      <div className="group/leader relative">
        <BotRow bot={bot} members={expanded ? undefined : openMembers} teamLeader selected={highlighted === bot.id} status={statuses[bot.id] ?? "available"} pinning={pinningBotId === bot.id} onTogglePinned={onTogglePinned} />
        <IconButton
          className="top-1/2 right-2 z-20 -translate-y-1/2 opacity-0 transition-[color,opacity] duration-[120ms] group-hover/leader:opacity-100 focus-visible:opacity-100 max-md:opacity-100"
          iconSize={13}
          position="absolute"
          size={24}
          type="button"
          label={expanded ? `Recolher time de ${bot.name}` : `Expandir time de ${bot.name}`}
          aria-expanded={expanded}
          aria-controls={memberListId}
          onClick={() => setExpanded((current) => !current)}
        >
          <ChevronDownIcon className={`transition-transform duration-150 ease-out motion-reduce:transition-none ${expanded ? "rotate-180" : "rotate-0"}`} aria-hidden="true" />
        </IconButton>
      </div>
      <div
        className={`grid transition-[grid-template-rows,opacity] duration-[160ms] ease-out motion-reduce:transition-none ${expanded ? "grid-rows-[1fr] overflow-visible opacity-100" : "pointer-events-none grid-rows-[0fr] overflow-hidden opacity-0"}`}
        id={memberListId}
        aria-hidden={!expanded}
        inert={!expanded ? true : undefined}
      >
        <ul className={`${memberListClassName} ${expanded ? "py-0.5" : "py-0"}`} id={closedListId} aria-label={`Integrantes de ${bot.name}`}>
          {openMembers.map((member) => <MemberItem key={member.id} member={member} selected={highlighted === member.id} status={statuses[member.id] ?? "available"} pinning={pinningBotId === member.id} onTogglePinned={onTogglePinned} />)}
          {groups.closed.length > 0 && (
            <li className={`${memberItemClassName} group/closed relative`}>
              <button className="mb-0.5 flex w-full cursor-pointer items-center gap-1.5 rounded-lg border border-transparent bg-transparent px-2.5 py-1.5 pr-9.5 text-left text-metadata font-medium text-muted hover:text-primary focus-visible:border-focus focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" type="button" aria-expanded={closedShown} aria-controls={closedListId} onClick={() => setClosedShown((current) => !current)}>
                Encerrados
                <ChevronDownIcon className={`size-3 transition-transform duration-150 ease-out motion-reduce:transition-none ${closedShown ? "rotate-180" : "rotate-0"}`} aria-hidden="true" />
              </button>
              <ClosedMembersCleanup client={client} leaderName={bot.name} members={groups.closed} />
            </li>
          )}
          {closedShown && groups.closed.map((member) => <MemberItem key={member.id} member={member} selected={highlighted === member.id} pinning={pinningBotId === member.id} onTogglePinned={onTogglePinned} />)}
        </ul>
      </div>
    </li>
  )
}

const memberListClassName = "relative mx-2 mt-0 mb-0 ml-5.5 min-h-0 min-w-0 list-none pr-0 pl-2.5"

function ClosedMembersCleanup({ client, leaderName, members }: { client: EngineClient; leaderName: string; members: Bot[] }) {
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const { mutateAsync: removeBot, isPending: removing } = useMutation(client.query.bots.remove.mutationOptions({
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: client.query.projects.key() })
      void queryClient.invalidateQueries({ queryKey: client.query.plugins.key() })
    },
  }))
  async function removeClosed() {
    const results = await Promise.allSettled(members.map((member) => removeBot({ id: member.id })))
    members.forEach((member, index) => {
      if (results[index]?.status === "fulfilled") {
        forgetBot(member.id)
      }
    })
  }

  return (
    <>
      <IconButton className="top-1/2 right-2 z-20 -translate-y-1/2" iconSize={13} position="absolute" size={24} type="button" label="Excluir encerrados" disabled={removing} onClick={() => setConfirming(true)}>
        <TrashIcon aria-hidden="true" />
      </IconButton>
      {confirming && (
        <ConfirmationDialog
          icon={<TrashIcon />}
          title="Excluir encerrados"
          onClose={() => !removing && setConfirming(false)}
          actions={(
            <>
              <Button variant="text" type="button" autoFocus disabled={removing} onClick={() => setConfirming(false)}>Cancelar</Button>
              <Button variant="danger" type="button" disabled={removing} onClick={() => { setConfirming(false); void removeClosed() }}>{removing ? "Excluindo..." : "Excluir"}</Button>
            </>
          )}
        >
          <p className="m-0 text-body text-secondary">{members.length === 1 ? `O integrante encerrado do time de ${leaderName} será excluído com a conversa e os arquivos dele.` : `Os ${members.length} integrantes encerrados do time de ${leaderName} serão excluídos com as conversas e os arquivos deles.`}</p>
        </ConfirmationDialog>
      )}
    </>
  )
}
const memberItemClassName = "relative block border-0 p-0 before:absolute before:top-[-2px] before:bottom-1/2 before:left-[-10px] before:w-2 before:rounded-bl before:border-b before:border-l before:border-outline before:content-[''] after:absolute after:top-1/2 after:bottom-[-2px] after:left-[-10px] after:w-px after:bg-outline after:content-[''] last:after:hidden"

function MemberItem({ member, selected, status, pinning, onTogglePinned }: { member: Bot; selected: boolean; status?: ChatStatus; pinning: boolean; onTogglePinned: TogglePinned }) {
  return (
    <li className={`${memberItemClassName}${member.closed ? " opacity-60" : ""}`}>
      <BotRow bot={member} member selected={selected} status={status} pinning={pinning} onTogglePinned={onTogglePinned} />
    </li>
  )
}

function describeMember(bot: Bot) {
  if (bot.temporary && !bot.closed) {
    return `Temporário · ${bot.function.outcome}`
  }

  return bot.function.outcome
}

function BotRow({ bot, member = false, members, selected, status, teamLeader = false, pinning, onTogglePinned }: { bot: Bot; member?: boolean; members?: Bot[]; selected: boolean; status?: ChatStatus; teamLeader?: boolean; pinning: boolean; onTogglePinned: TogglePinned }) {
  const avatarSizeClassName = members?.length ? "h-[38px] w-[51px] min-w-[51px]" : "size-[38px] min-w-[38px]"
  const selectionClassName = selected ? "border-outline bg-surface-raised text-primary" : "border-transparent bg-transparent text-secondary"
  const tooltip = useTooltip()
  const contextMenuRef = useRef<HTMLDivElement>(null)

  function openContextMenuAt(x: number, y: number) {
    const menu = contextMenuRef.current

    if (!menu) {
      return
    }

    menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - 224))}px`
    menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - 52))}px`
    menu.showPopover()
    menu.querySelector("button")?.focus()
  }

  function handleContextMenu(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault()
  }

  function handlePointerUp(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 2) {
      return
    }

    event.preventDefault()
    openContextMenuAt(event.clientX, event.clientY)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) {
      return
    }

    event.preventDefault()
    const bounds = event.currentTarget.getBoundingClientRect()

    openContextMenuAt(bounds.left + 24, bounds.top + bounds.height / 2)
  }

  return (
    <>
    <button
      className={`group/row relative mb-0.5 flex w-full items-center gap-2.5 rounded-lg border px-2.5 text-left hover:border-outline hover:bg-surface-raised focus-visible:border-focus focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none active:bg-surface-active disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-transparent disabled:hover:bg-transparent ${selectionClassName} ${member ? "py-2" : "py-2.5"} ${teamLeader ? "pr-9.5" : ""}`}
      type="button"
      aria-current={selected ? "true" : undefined}
      onClick={() => selectBot(bot.id)}
      onContextMenu={handleContextMenu}
      onPointerUp={handlePointerUp}
      onKeyDown={handleKeyDown}
      {...tooltip.focusProps}
    >
      <span {...tooltip.anchorProps} className={`relative z-10 flex shrink-0 flex-row gap-0 overflow-visible whitespace-normal ${avatarSizeClassName}`} role={status && "img"} aria-label={status && `Status: ${chatStatusLabels[status]}`}>
        <span className="relative flex shrink-0">
          <BotAvatar bot={bot} members={members} />
          {status && <span className={`absolute right-0.5 bottom-0.5 z-5 size-[7px] rounded-full ${chatStatusClassNames[status]}`} aria-hidden="true" />}
        </span>
      </span>
      {status && <Tooltip {...tooltip.popoverProps}>{chatStatusLabels[status]}</Tooltip>}
      <span className="flex min-w-0 flex-1 flex-col gap-1 overflow-hidden">
        <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-control font-semibold text-primary">{bot.name}</strong>
        <small className="overflow-hidden text-ellipsis whitespace-nowrap text-metadata font-medium text-muted">{describeMember(bot)}</small>
      </span>
      </button>
      <div ref={contextMenuRef} className={`${menuCardClassName} fixed inset-auto z-50`} popover="auto" aria-label={`Ações de ${bot.name}`}>
        <MenuOption icon={<BookmarkIcon className="size-4 shrink-0 text-muted" aria-hidden="true" />} label={bot.pinned ? "Desafixar" : "Fixar"} selected={false} disabled={pinning} onSelect={() => onTogglePinned(bot)} />
      </div>
    </>
  )
}

function BotAvatar({ bot, members }: { bot: Bot; members?: Bot[] }) {
  if (!members || members.length === 0) {
    return (
      <BotFace
        className="grid size-[38px] shrink-0 place-items-center text-support font-extrabold text-focus"
        name={bot.avatarSeed}
        botId={bot.id}
        size={38}
      />
    )
  }

  const memberCountLabel = members.length === 1 ? "1 integrante" : `${members.length} integrantes`

  const [first, second] = members

  return (
    <span className="group/stack relative block h-[38px] w-[51px] min-w-[51px] shrink-0 overflow-visible" role="img" aria-label={`${bot.name} lidera ${memberCountLabel}`}>
      <BotFace
        className={`absolute top-[7px] z-1 size-[24px] ${teamAvatarFaceClassName} ${second ? "left-0 group-hover/stack:-translate-x-0.75" : "left-[2px] group-hover/stack:-translate-x-0.5"}`}
        name={first.avatarSeed}
        botId={first.id}
        size={24}
      />
      {second && (
        <BotFace
          className={`absolute top-[7px] right-0 z-1 size-[24px] ${teamAvatarFaceClassName} group-hover/stack:translate-x-0.75`}
          name={second.avatarSeed}
          botId={second.id}
          size={24}
        />
      )}
      <BotFace
        className={`absolute top-[3px] z-2 size-[32px] ${teamAvatarFaceClassName} ${second ? "left-[9px]" : "left-[15px]"}`}
        name={bot.avatarSeed}
        botId={bot.id}
        size={32}
      />
    </span>
  )
}
