import { useMutation, useQueryClient } from "@tanstack/react-query"
import { type FormEvent, useState } from "react"
import type { Bot } from "@src/shared/bots"
import type { ProjectGroups } from "@src/shared/projects"
import type { EngineClient } from "../engine-client"
import { Button } from "../ui/button"
import { Field, fieldControlClassName } from "../ui/field"
import { settingsPanelClassName } from "../ui/settings-section"
import { useEscape } from "../ui/use-escape"
import { BotFace } from "./bot-face"
import { teamLeaders } from "./team"

export function BotMemberPicker({ bot, client, groups, onCancel, onAdded }: { bot: Bot; client: EngineClient; groups: ProjectGroups | undefined; onCancel: () => void; onAdded: (member: Bot) => void }) {
  const [search, setSearch] = useState("")
  const [selectedId, setSelectedId] = useState("")
  const leaders = teamLeaders(groups)
  const allBots = leaders.flatMap((leader) => [leader, ...leader.members])
  const leadingIds = new Set(leaders.filter((leader) => leader.members.length > 0).map((leader) => leader.id))
  const candidates = allBots.filter((candidate) => candidate.id !== bot.id && candidate.leaderBotId !== bot.id && !candidate.temporary && !leadingIds.has(candidate.id))
  const query = search.trim().toLocaleLowerCase("pt-BR")
  const visible = candidates.filter((candidate) => `${candidate.name} ${candidate.function.outcome}`.toLocaleLowerCase("pt-BR").includes(query))
  const selected = candidates.find((candidate) => candidate.id === selectedId)
  const previousLeader = leaders.find((leader) => leader.id === selected?.leaderBotId)
  const incomingColleagues = allBots.filter((candidate) => candidate.colleagueIds.includes(selectedId))
  const projectName = groups?.projects.find((project) => project.id === bot.projectId)?.name ?? "Sem projeto"
  const queryClient = useQueryClient()
  const { mutate: add, isPending: adding, error } = useMutation(client.query.bots.addMember.mutationOptions({
    async onSuccess(member) {
      await queryClient.invalidateQueries({ queryKey: client.query.projects.list.queryOptions().queryKey })
      onAdded(member)
    },
  }))
  useEscape(() => { if (!adding) { onCancel() } })

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!selected || adding) {
      return
    }

    add({ leaderBotId: bot.id, botId: selected.id })
  }

  return (
    <form className={`${settingsPanelClassName} flex flex-col gap-4`} aria-label={`Adicionar Bot existente a ${bot.name}`} onSubmit={handleSubmit}>
      <div>
        <h3 className="m-0 text-section font-semibold text-primary">Adicionar Bot existente</h3>
        <p className="m-0 mt-1 text-support text-secondary">Escolha um Bot permanente que ainda não tenha Integrantes.</p>
      </div>
      <Field label="Buscar Bots"><input className={fieldControlClassName} type="search" autoFocus autoComplete="off" placeholder="Nome ou Função" value={search} disabled={adding} onChange={(event) => setSearch(event.target.value)} /></Field>
      {candidates.length === 0 && <p className="m-0 text-support text-secondary">Nenhum Bot disponível. Você pode cancelar e criar um integrante do zero.</p>}
      {candidates.length > 0 && visible.length === 0 && <p className="m-0 text-support text-secondary">Nenhum Bot encontrado. Tente outro nome ou Função.</p>}
      {visible.length > 0 && (
        <fieldset className="m-0 flex max-h-64 min-w-0 flex-col gap-1 overflow-y-auto border-0 p-0" disabled={adding}>
          <legend className="sr-only">Bot para adicionar ao time</legend>
          {visible.map((candidate) => (
            <label className={`grid cursor-pointer grid-cols-[32px_minmax(0,1fr)_16px] items-center gap-x-2 gap-y-1 rounded-lg p-2 hover:bg-surface-hover has-focus-visible:ring-1 has-focus-visible:ring-ring ${selectedId === candidate.id ? "bg-surface-active" : ""}`} key={candidate.id}>
              <BotFace className="size-8 flex-none" name={candidate.avatarSeed} botId={candidate.id} size={32} />
              <strong className="min-w-0 text-control font-semibold break-words text-primary">{candidate.name}</strong>
              <input className="size-4 accent-accent" type="radio" name="existing-member" value={candidate.id} checked={selectedId === candidate.id} onChange={() => setSelectedId(candidate.id)} />
              <span className="col-span-2 col-start-2 text-support break-words text-secondary max-[480px]:col-span-3 max-[480px]:col-start-1">{candidate.function.outcome}</span>
            </label>
          ))}
        </fieldset>
      )}
      {selected && (
        <div className="flex flex-col gap-2 border-t border-outline pt-4 text-support text-secondary" aria-live="polite">
          <p className="m-0"><strong className="font-semibold text-primary">{selected.name}</strong> entrará no time de {bot.name}.</p>
          {previousLeader && <p className="m-0">Sairá do time de {previousLeader.name}.</p>}
          {selected.projectId !== bot.projectId && <p className="m-0">Passará para {projectName}.</p>}
          <p className="m-0">Conversa, Memória, Função, Pasta de trabalho e Acessos serão mantidos.</p>
          {incomingColleagues.length > 0 && <p className="m-0">Deixará de ser Colega de {incomingColleagues.map((colleague) => colleague.name).join(", ")}. Integrantes não podem ser Colegas.</p>}
        </div>
      )}
      {error && <p className="m-0 text-support text-status-error" role="alert">Falha ao adicionar integrante: {error.message}</p>}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="text" type="button" disabled={adding} onClick={onCancel}>Cancelar</Button>
        <Button type="submit" disabled={!selected || adding}>{adding ? "Adicionando..." : "Adicionar ao time"}</Button>
      </div>
    </form>
  )
}
