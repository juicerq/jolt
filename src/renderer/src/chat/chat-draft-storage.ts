import type { ChatDraft } from "./chat-store"
import type { ChatMention } from "./chat-mentions"
import { messageImageMimeTypes } from "@src/shared/message-images"
import type { MessageImage } from "@src/shared/conversations"

const storageKey = "mimo.chat-drafts.v1"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isMention(value: unknown): value is ChatMention {
  return isRecord(value) && typeof value.botId === "string" && typeof value.name === "string" && typeof value.avatarSeed === "string"
}

function isImage(value: unknown): value is MessageImage {
  return isRecord(value) && typeof value.data === "string" && messageImageMimeTypes.some((mimeType) => mimeType === value.mimeType)
}

function isDraft(value: unknown): value is ChatDraft {
  return isRecord(value) && typeof value.content === "string" && Array.isArray(value.images) && value.images.every(isImage) && Array.isArray(value.mentions) && value.mentions.every(isMention) && (value.command === undefined || value.command === "lembrar")
}

export function loadChatDrafts(): Record<string, ChatDraft> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "{}")

    if (!isRecord(value)) {
      return {}
    }

    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, ChatDraft] => isDraft(entry[1])))
  } catch {
    return {}
  }
}

export function saveChatDrafts(drafts: Record<string, ChatDraft>) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(Object.entries(drafts).filter(([, draft]) => draft.content || draft.images.length || draft.command))))

    return true
  } catch {
    return false
  }
}
