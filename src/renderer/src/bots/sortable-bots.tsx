import { useSelector } from "@tanstack/react-store"
import { type ReactNode, useCallback, useState, useRef } from "react"
import { botOrderStore, orderedBots, saveBotOrder } from "./bot-order"
import { useBotDrop } from "./bot-drop"
import { bindBotSorting } from "./bot-sorting"

export function SortableBots<T extends { id: string }>({ group, items, children, className = "m-0 list-none p-0", label }: { group: string; items: T[]; children: (bot: T) => ReactNode; className?: string; label?: string }) {
  const drop = useBotDrop()
  const latestDrop = useRef(drop)
  latestDrop.current = drop
  const order = useSelector(botOrderStore, (state) => state[group])
  const [notice, setNotice] = useState("")
  const sorted = orderedBots(items, order)
  const attach = useCallback((list: HTMLUListElement | null) => {
    if (!list) {
      return
    }

    return bindBotSorting(list, (next, name, position) => {
      const saved = saveBotOrder(group, next)
      setNotice(saved ? `${name} na posição ${position} de ${next.length}.` : "Ordem alterada nesta sessão, mas não foi possível salvá-la no dispositivo.")
    }, () => latestDrop.current)
  }, [group])

  return <>
    <ul data-sort-group={group} aria-label={label} ref={attach} className={`sortable-bots ${className}`}>{sorted.map(children)}</ul>
    <span className="sr-only" role="status">{notice}</span>
  </>
}
