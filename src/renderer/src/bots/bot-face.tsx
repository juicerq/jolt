import { Blobatar } from "@blobatar/react"
import { useSelector } from "@tanstack/react-store"
import { useCallback, useRef } from "react"
import { chatStatusLabels } from "../chat/chat-status"
import { chatStore, type ChatStatus } from "../chat/chat-store"

export function BotFace({ name, size, className, botId, status: recordedStatus }: { name: string; size: number; className: string; botId?: string; status?: ChatStatus }) {
  const status = useSelector(chatStore, (state) => botId ? state.statuses[botId] ?? recordedStatus ?? "available" : recordedStatus ?? "available")
  const previousStatus = useRef(status)
  const handleStatusChange = useCallback((element: SVGSVGElement | null) => {
    if (!element || previousStatus.current === status) {
      return
    }

    previousStatus.current = status

    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)")

    if (status !== "completed" || motionPreference.matches) {
      return
    }

    const animations = [...element.querySelectorAll(".mo-eye")].map((eye) => eye.animate([
      { transform: "scale(1, 1)", offset: 0 },
      { transform: "scale(1.1, 0.35)", offset: 0.2 },
      { transform: "scale(1.1, 0.35)", offset: 0.6 },
      { transform: "scale(1, 1)", offset: 1 },
    ], { duration: 1600, easing: "ease-in-out" }))
    const body = element.querySelector(".mo-breathe")

    if (body) {
      animations.push(body.animate([
        { transform: "translateY(0)", offset: 0 },
        { transform: "translateY(-1.5px)", offset: 0.25 },
        { transform: "translateY(0)", offset: 1 },
      ], { duration: 1600, easing: "ease-in-out" }))
    }

    function cancel() {
      motionPreference.removeEventListener("change", cancel)
      animations.forEach((animation) => animation.cancel())
    }

    motionPreference.addEventListener("change", cancel, { once: true })
    void Promise.allSettled(animations.map((animation) => animation.finished)).then(() => motionPreference.removeEventListener("change", cancel))

    return cancel
  }, [status])

  return (
    <span className={`bot-face inline-flex shrink-0 ${className}`} data-status={status} role={botId ? "img" : undefined} aria-label={botId ? chatStatusLabels[status] : undefined}>
      <span className="relative inline-flex size-full">
        <Blobatar
          name={name}
          size={size}
          animate="always"
          className="size-full"
          ref={handleStatusChange}
        />
        <svg className="bot-face-signal pointer-events-none absolute inset-0 size-full overflow-visible" viewBox="0 0 100 100" aria-hidden="true">
          <g className="bot-face-work" fill="currentColor">
            <circle cx="41" cy="91" r="2.5" />
            <circle cx="50" cy="91" r="2.5" />
            <circle cx="59" cy="91" r="2.5" />
          </g>
          <g className="bot-face-call">
            <path d="M73 9h14a6 6 0 0 1 6 6v11a6 6 0 0 1-6 6h-7l-7 5v-5a6 6 0 0 1-6-6V15a6 6 0 0 1 6-6Z" fill="currentColor" />
            <path d="M80 16v7m0 4v.5" stroke="var(--color-canvas)" strokeWidth="3" strokeLinecap="round" />
          </g>
        </svg>
      </span>
    </span>
  )
}
