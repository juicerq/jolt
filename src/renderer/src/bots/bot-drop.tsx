import { createContext, type ReactNode, useContext, useState, useRef } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { ProjectGroups } from "@src/shared/projects"
import type { EngineClient } from "../engine-client"
import { animateBotPlacement } from "./bot-motion"
import { teamLeaders } from "./team"

export interface BotDrop {
  botId: string
  leaderBotId: string | null
  label: string
  target: HTMLElement | null
  origin?: Pick<DOMRect, "left" | "top">
}

interface DropPoint {
  botId: string
  button: HTMLElement | null
  x: number
  y: number
  team: HTMLElement | null
}

const BotDropContext = createContext<{
  resolve: (point: DropPoint) => BotDrop | null
  apply: (drop: BotDrop) => void
} | null>(null)

export function useBotDrop() {
  return useContext(BotDropContext)
}

export function BotDropProvider({ client, data, children }: { client: EngineClient; data: ProjectGroups | undefined; children: ReactNode }) {
  const container = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  const [notice, setNotice] = useState("")
  const leaders = teamLeaders(data)
  const bots = leaders.flatMap((bot) => [bot, ...bot.members])
  const { mutate, isPending, isError } = useMutation({
    async mutationFn(drop: BotDrop) {
      if (drop.leaderBotId) {
        return await client.raw.bots.addMember({ botId: drop.botId, leaderBotId: drop.leaderBotId })
      }

      return await client.raw.bots.detachMember({ id: drop.botId })
    },
    async onSuccess(bot, drop) {
      const before = new Map([...container.current?.querySelectorAll<HTMLElement>("[data-bot-id]") ?? []].map((element) => [element.dataset.botId, element.getBoundingClientRect()]))

      setNotice(bot.leaderBotId ? `${bot.name} adicionado ao time.` : `${bot.name} agora é independente.`)
      await queryClient.invalidateQueries({ queryKey: client.query.projects.key() })
      requestAnimationFrame(() => {
        const buttons = [...container.current?.querySelectorAll<HTMLElement>("[data-bot-id]") ?? []]
        const visible = buttons.some((element) => element.dataset.botId === bot.id && element.getBoundingClientRect().height > 0 && !element.closest("[inert]"))

        buttons.forEach((element) => {
          const landed = element.dataset.botId === bot.id
          const from = landed ? drop.origin : before.get(element.dataset.botId)

          if (from) {
            animateBotPlacement(element, from, landed || (!visible && element.dataset.botId === bot.leaderBotId))
          }
        })
      })
    },
    onError(error) {
      setNotice(`Não foi possível mover o Bot: ${error.message}`)
    },
  })

  function resolve(point: DropPoint): BotDrop | null {
    const { botId } = point
    const bot = bots.find((bot) => bot.id === botId)

    if (!bot || bot.temporary || isPending || leaders.some((leader) => leader.id === botId && leader.members.length > 0)) {
      return null
    }

    return resolveTarget(bot, point)
  }

  function resolveTarget(bot: (typeof bots)[number], { botId, button, x, y, team }: DropPoint): BotDrop | null {
    const targetId = team?.dataset.botTeam ?? button?.dataset.botId
    const target = bots.find((bot) => bot.id === targetId)
    const center = !!team || isRowCenter(button, x, y)

    if (target && center) {
      return intoTeam(bot, target, team ?? button)
    }

    // Leaving a team keeps the project, matching the existing detach action.
    if (bot.leaderBotId && !team && (!target || (!target.leaderBotId && target.projectId === bot.projectId))) {
      return { botId, leaderBotId: null, label: "Tornar independente", target: button }
    }

    return null
  }

  function intoTeam(bot: (typeof bots)[number], target: (typeof bots)[number], element: HTMLElement | null): BotDrop | null {
    const leader = bots.find((bot) => bot.id === (target.leaderBotId ?? target.id))

    if (!leader || leader.temporary || leader.id === bot.id || leader.id === bot.leaderBotId) {
      return null
    }

    return { botId: bot.id, leaderBotId: leader.id, label: `Entrar no time de ${leader.name}`, target: element }
  }

  return <BotDropContext value={{ resolve, apply: (drop) => { setNotice("Movendo Bot…"); mutate(drop) } }}>
    <div ref={container} className="contents">{children}</div>
    {notice && <p className={`bot-drop-notice ${isError ? "text-status-error" : "text-secondary"}`} role={isError ? "alert" : "status"}>
      {notice}<button type="button" className="ml-3 bg-transparent text-secondary" aria-label="Fechar aviso" onClick={() => setNotice("")}>×</button>
    </p>}
  </BotDropContext>
}

function isRowCenter(button: HTMLElement | null, x: number, y: number) {
  if (!button) {
    return false
  }

  const bounds = button.getBoundingClientRect()

  return y > bounds.top + bounds.height * .25 && y < bounds.bottom - bounds.height * .25 && x > bounds.left + 20
}
