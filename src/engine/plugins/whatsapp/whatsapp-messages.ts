import { getContentType, jidNormalizedUser, normalizeMessageContent, type WAMessage } from "baileys"
import type { WhatsappSavedMessage } from "../../../shared/whatsapp"

export type IncomingMessage = Omit<WhatsappSavedMessage, "accountId">

const systemKinds = new Set(["protocolMessage", "senderKeyDistributionMessage", "messageContextInfo", "placeholderMessage", "deviceSentMessage", "keepInChatMessage"])

const kindLabels: Record<string, string> = {
  albumMessage: "album",
  audioMessage: "audio",
  buttonsMessage: "buttons",
  buttonsResponseMessage: "button reply",
  contactMessage: "contact",
  contactsArrayMessage: "contacts",
  documentMessage: "document",
  documentWithCaptionMessage: "document",
  eventMessage: "event",
  imageMessage: "image",
  interactiveMessage: "interactive",
  interactiveResponseMessage: "interactive reply",
  listMessage: "list",
  listResponseMessage: "list reply",
  liveLocationMessage: "live location",
  locationMessage: "location",
  lottieStickerMessage: "sticker",
  pollCreationMessage: "poll",
  pollCreationMessageV2: "poll",
  pollCreationMessageV3: "poll",
  pollUpdateMessage: "poll vote",
  ptvMessage: "video note",
  ptcMessage: "voice note",
  questionMessage: "question",
  questionReplyMessage: "question reply",
  scheduledCallCreationMessage: "scheduled call",
  stickerMessage: "sticker",
  templateMessage: "template",
  videoMessage: "video",
}

export function textOf(message: WAMessage) {
  const content = normalizeMessageContent(message.message)
  const written = content?.conversation ?? content?.extendedTextMessage?.text ?? content?.imageMessage?.caption ?? content?.videoMessage?.caption ?? content?.documentMessage?.caption

  if (written) {
    return written
  }

  const reaction = content?.reactionMessage?.text

  if (reaction) {
    return `[reacted ${reaction}]`
  }

  const kind = getContentType(content)

  if (!kind || systemKinds.has(kind)) {
    return ""
  }

  return `[${kindLabels[kind] ?? kind.replace(/Message(V\d)?$/, "")}]`
}

export function nameOf(contact: { name?: string | null; notify?: string | null; verifiedName?: string | null }) {
  return [contact.name, contact.verifiedName, contact.notify].find((candidate) => candidate?.trim()) ?? ""
}

export function incoming(message: WAMessage, names: Map<string, string>): IncomingMessage | undefined {
  const chatId = jidNormalizedUser(message.key.remoteJid ?? "")
  const id = message.key.id
  const seconds = Number(message.messageTimestamp ?? 0)

  if (!chatId || !id || !seconds) {
    return undefined
  }

  const content = textOf(message)

  if (!content) {
    return undefined
  }

  const fromMe = message.key.fromMe === true
  const sender = fromMe ? "" : jidNormalizedUser(message.key.participant ?? message.key.remoteJid ?? "")

  return {
    id: `${chatId}:${id}`,
    chatId,
    senderName: fromMe ? "eu" : names.get(sender) || message.pushName || names.get(chatId) || sender,
    fromMe,
    content,
    sentAt: new Date(seconds * 1000).toISOString(),
  }
}
