import { Blobatar } from "@blobatar/react"
import { useSelector } from "@tanstack/react-store"
import { useCallback, useRef } from "react"
import { chatStore } from "../chat/chat-store"

export function BotFace({ name, size, className, botId }: { name: string; size: number; className: string; botId?: string }) {
  const status = useSelector(chatStore, (state) => botId ? state.statuses[botId] ?? "available" : "available")
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
    <Blobatar
      name={name}
      size={size}
      animate="always"
      className={`bot-face ${className}`}
      data-status={status}
      ref={handleStatusChange}
    />
  )
}
