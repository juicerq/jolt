import { z } from "zod"

export const browserAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("navigate"), url: z.url({ protocol: /^https?$/ }) }),
  z.object({ action: z.literal("snapshot") }),
  z.object({ action: z.literal("click"), target: z.string().regex(/^@e[0-9]+$/) }),
  z.object({ action: z.literal("fill"), target: z.string().regex(/^@e[0-9]+$/), text: z.string().max(20_000) }),
  z.object({ action: z.literal("press"), key: z.enum(["Enter", "Tab", "Escape", "ArrowDown", "ArrowUp", "Backspace"]) }),
  z.object({ action: z.literal("scroll"), direction: z.enum(["up", "down"]) }),
  z.object({ action: z.literal("handoff"), reason: z.string().min(1).max(500) }),
  z.object({ action: z.literal("close") }),
])

export const browserRequest = z.object({
  type: z.literal("browser-request"),
  id: z.uuid(),
  botId: z.string().min(1),
  botName: z.string().min(1),
  input: browserAction,
})

export const browserReply = z.object({
  type: z.literal("browser-reply"),
  id: z.uuid(),
  result: z.string(),
  error: z.boolean(),
})

export const browserCancel = z.object({ type: z.literal("browser-cancel"), id: z.uuid() })

export const browserBounds = z.object({ x: z.int().min(0), y: z.int().min(0), width: z.int().min(1), height: z.int().min(1) })

export interface BrowserPreview {
  botId: string
  botName: string
  url: string
  title: string
  control: "bot" | "user"
  reason: string | null
  image: string | null
  error: string | null
}

export interface BrowserState {
  pages: BrowserPreview[]
  focusedBotId: string | null
}

export type BrowserAction = z.infer<typeof browserAction>
export type BrowserRequest = z.infer<typeof browserRequest>
export type BrowserReply = z.infer<typeof browserReply>
export type BrowserBounds = z.infer<typeof browserBounds>
