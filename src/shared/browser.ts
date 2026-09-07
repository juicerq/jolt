import { z } from "zod"

const botId = z.string().min(1)

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
  botId,
  botName: z.string().min(1),
  input: browserAction,
})

const browserReply = z.object({
  type: z.literal("browser-reply"),
  id: z.uuid(),
  result: z.string(),
  error: z.boolean(),
})

export const browserCancel = z.object({ type: z.literal("browser-cancel"), id: z.uuid() })

export const browserBounds = z.object({ x: z.int().min(0), y: z.int().min(0), width: z.int().min(1), height: z.int().min(1) })

export const browserFrameInput = z.object({ botId, after: z.int().min(0) })

export const browserFrame = z.object({
  seq: z.int().min(1),
  width: z.int().min(1),
  height: z.int().min(1),
  image: z.string().min(1),
})

const browserPreview = z.object({
  botId,
  botName: z.string().min(1),
  url: z.string(),
  title: z.string(),
  control: z.enum(["bot", "user"]),
  popup: z.boolean(),
  reason: z.string().nullable(),
  image: z.string().nullable(),
  error: z.string().nullable(),
})

export const browserPages = z.array(browserPreview)

export const browserFrameRequest = z.object({ type: z.literal("browser-frame-request"), id: z.uuid(), input: browserFrameInput })

const browserFrameReply = z.object({ type: z.literal("browser-frame-reply"), id: z.uuid(), frame: browserFrame.nullable(), error: z.string().nullable() })

export const browserPagesMessage = z.object({ type: z.literal("browser-pages"), pages: browserPages })

export const browserMainMessage = z.discriminatedUnion("type", [browserReply, browserFrameReply, browserPagesMessage])

export interface BrowserState {
  pages: BrowserPreview[]
  focusedBotId: string | null
}

export type BrowserAction = z.infer<typeof browserAction>
export type BrowserRequest = z.infer<typeof browserRequest>
export type BrowserReply = z.infer<typeof browserReply>
export type BrowserBounds = z.infer<typeof browserBounds>
export type BrowserFrameInput = z.infer<typeof browserFrameInput>
export type BrowserFrame = z.infer<typeof browserFrame>
export type BrowserPreview = z.infer<typeof browserPreview>
export type BrowserFrameReply = z.infer<typeof browserFrameReply>
export type BrowserPagesMessage = z.infer<typeof browserPagesMessage>
