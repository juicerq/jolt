import { z } from "zod"
import { id } from "./ids"

const storedMessage = z.strictObject({
  id,
  accountId: id,
  chatId: id,
  chatName: z.string(),
  senderName: z.string(),
  fromMe: z.boolean(),
  content: z.string(),
  sentAt: id,
})
const savedMessage = storedMessage.omit({ chatName: true })
const chat = z.strictObject({
  chatId: id,
  chatName: z.string(),
  lastSentAt: id,
  lastSenderName: z.string(),
  lastContent: z.string(),
  messages: z.int().nonnegative(),
})

const contact = z.strictObject({ accountId: id, jid: id, name: z.string().min(1) })

export const whatsappChatKinds = ["contact", "group", "newsletter", "self"] as const
const chatKind = z.enum(whatsappChatKinds)

export const whatsappSchemas = {
  storedMessageList: z.array(storedMessage),
  chatList: z.array(chat),
}

export type WhatsappMessage = z.infer<typeof storedMessage>
export type WhatsappSavedMessage = z.infer<typeof savedMessage>
export type WhatsappChat = z.infer<typeof chat>
export type WhatsappContact = z.infer<typeof contact>
export type WhatsappChatKind = z.infer<typeof chatKind>
