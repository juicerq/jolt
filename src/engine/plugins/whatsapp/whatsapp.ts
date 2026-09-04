import { Browsers, DisconnectReason, jidNormalizedUser, makeWASocket, type WASocket } from "baileys"
import { z } from "zod"
import { parse } from "../../../shared/parse"
import type { PluginStep, ToolDescriptor } from "../../../shared/plugins"
import { whatsappChatKinds, type WhatsappChat, type WhatsappChatKind, type WhatsappMessage } from "../../../shared/whatsapp"
import type { Observability } from "../../observability/observability"
import type { AppDatabase } from "../../persistence/database"
import { PluginAuthError, type PluginAccountSession, type PluginAdapter } from "../plugin-adapter"
import { whatsappAuth } from "./whatsapp-auth"
import { incoming, nameOf, type IncomingMessage } from "./whatsapp-messages"

const reconnectDelayMs = 3000
const chatProperty = { type: "string", description: "Chat id from whatsapp_chats" } as const

const chatIdList = z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]).transform((value) => Array.isArray(value) ? value : [value])

const inputs = {
  whatsapp_chats: z.object({ limit: z.coerce.number().int().min(1).max(100).default(30), kinds: z.array(z.enum(whatsappChatKinds)).min(1).default([...whatsappChatKinds]) }),
  whatsapp_read: z.object({ chatIds: chatIdList, limit: z.coerce.number().int().min(1).max(200).default(30) }),
  whatsapp_send: z.object({ chatId: z.string().min(1), text: z.string().min(1) }),
}

export const whatsappTools: ToolDescriptor[] = [
  {
    name: "whatsapp_chats",
    label: "Lista de conversas do WhatsApp",
    description: "List the person's WhatsApp chats, most recent first. Each chat shows its id, its name, what kind of chat it is, when the last message arrived, how many messages Jolt has stored, and the last message itself with its sender. Use this first: it is cheap, and it gives you the chat ids that whatsapp_read and whatsapp_send need. Jolt only stores what arrived while it was open.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Maximum chats, default 30, up to 100" },
        kinds: { type: "array", items: { type: "string", enum: [...whatsappChatKinds] }, description: "Kinds of chat to list. contact is one person, group is many, newsletter is a channel the person follows, self is the person's own notes. All kinds by default." },
      },
    },
  },
  {
    name: "whatsapp_read",
    label: "Leitura de conversa do WhatsApp",
    description: "Read the stored messages of one or more WhatsApp chats, oldest first, with sender, time and text. Pass every chat you need in one call. Non-text messages read as a marker such as [image]. The stored history has gaps: Jolt loses what arrived while it was closed and never recovers it. Do not assume you read the whole conversation.",
    inputSchema: {
      type: "object",
      properties: {
        chatIds: { type: "array", items: { type: "string" }, description: "Chat ids from whatsapp_chats" },
        limit: { type: "number", description: "Maximum messages per chat, default 30, up to 200" },
      },
      required: ["chatIds"],
    },
  },
  {
    name: "whatsapp_send",
    label: "Envio de mensagem no WhatsApp",
    description: "Send a text message to a WhatsApp chat right away, as the person. Whoever reads it sees a message from the person, with no sign that a Bot wrote it.",
    inputSchema: { type: "object", properties: { chatId: chatProperty, text: { type: "string", description: "Message text" } }, required: ["chatId", "text"] },
  },
]

interface Session {
  socket(): WASocket
  auth: ReturnType<typeof whatsappAuth>
  names: Map<string, string>
  buffer: IncomingMessage[]
  opened: Promise<string>
  accountId?: string
  save?(): void
  close(): Promise<void>
}

export function createWhatsappAdapter(input: { observability: Observability; database: Pick<AppDatabase, "whatsappMessages"> }): PluginAdapter {
  const sessions = new Map<string, Session>()
  const paired = new Map<string, Session>()

  function open(details: { secret: string; step?(step: PluginStep): void }): Session {
    const auth = whatsappAuth(details.secret)
    const names = new Map<string, string>()
    const buffer: IncomingMessage[] = []
    let current: WASocket | undefined
    let closed = false
    let loggedOut = false
    let resolveOpened: (label: string) => void = () => {}
    let rejectOpened: (error: Error) => void = () => {}
    const opened = new Promise<string>((resolve, reject) => {
      resolveOpened = resolve
      rejectOpened = reject
    })

    const session: Session = {
      socket() {
        if (loggedOut) {
          throw new PluginAuthError("WhatsApp signed this Conta out")
        }

        if (!current) {
          throw new Error("The WhatsApp session is not open yet")
        }

        return current
      },
      auth,
      names,
      buffer,
      opened,
      async close() {
        closed = true
        current?.end(undefined)
        current = undefined
      },
    }

    function store(message: IncomingMessage) {
      if (!session.accountId) {
        buffer.push(message)

        return
      }

      input.database.whatsappMessages.save({ ...message, accountId: session.accountId })
    }

    function remember(contacts: { id?: string | null; name?: string | null; notify?: string | null; verifiedName?: string | null }[]) {
      for (const contact of contacts) {
        const jid = jidNormalizedUser(contact.id ?? "")
        const name = nameOf(contact)

        if (!jid || !name || names.get(jid) === name) {
          continue
        }

        names.set(jid, name)

        if (session.accountId) {
          input.database.whatsappMessages.saveContact({ accountId: session.accountId, jid, name })
        }
      }
    }

    function start() {
      const socket = makeWASocket({
        auth: auth.state,
        browser: Browsers.ubuntu("Chrome"),
        syncFullHistory: true,
        shouldSyncHistoryMessage: () => true,
        markOnlineOnConnect: false,
      })
      current = socket

      socket.ev.on("creds.update", () => {
        session.save?.()
      })

      socket.ev.on("contacts.upsert", remember)
      socket.ev.on("contacts.update", remember)
      socket.ev.on("chats.upsert", (chats) => remember(chats.map((chat) => ({ id: chat.id, name: chat.name }))))
      socket.ev.on("groups.upsert", (groups) => remember(groups.map((group) => ({ id: group.id, name: group.subject }))))
      socket.ev.on("groups.update", (groups) => remember(groups.map((group) => ({ id: group.id, name: group.subject }))))

      socket.ev.on("messaging-history.set", (history) => {
        remember(history.contacts)
        remember(history.chats.map((chat) => ({ id: chat.id, name: chat.name })))
        const messages = history.messages.flatMap((message) => {
          const row = incoming(message, names)

          if (!row || !session.accountId) {
            return []
          }

          return [{ ...row, accountId: session.accountId }]
        })

        if (messages.length > 0) {
          input.database.whatsappMessages.saveMany(messages)
        }
      })

      socket.ev.on("messages.upsert", (upsert) => {
        for (const message of upsert.messages) {
          const row = incoming(message, names)

          if (row) {
            store(row)
          }
        }
      })

      socket.ev.on("connection.update", (update) => {
        if (update.qr && details.step) {
          details.step({ type: "qr", code: update.qr })
        }

        if (update.connection === "open") {
          resolveOpened(jidNormalizedUser(socket.user?.id ?? "").split("@")[0] ?? "WhatsApp")
        }

        if (update.connection !== "close") {
          return
        }

        const status = (update.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode

        if (closed || status === DisconnectReason.loggedOut) {
          loggedOut = status === DisconnectReason.loggedOut
          rejectOpened(new Error("The WhatsApp session was closed"))
          current = undefined

          return
        }

        input.observability.event({ name: "plugin.whatsappreconnecting", context: { pluginId: "whatsapp" }, attributes: { reason: update.lastDisconnect?.error?.message ?? "closed", ...(status ? { status: String(status) } : {}) } })
        setTimeout(start, reconnectDelayMs)
      })
    }

    start()

    return session
  }

  async function resolveNames(account: PluginAccountSession) {
    const lids = input.database.whatsappMessages.unnamedChats(account.id).filter((chatId) => chatId.endsWith("@lid"))

    if (lids.length === 0) {
      return
    }

    const session = live(account)
    const mappings = await session.socket().signalRepository.lidMapping.getPNsForLIDs(lids)

    for (const mapping of mappings ?? []) {
      const jid = jidNormalizedUser(mapping.lid)
      const number = jidNormalizedUser(mapping.pn).split("@")[0] ?? ""
      const name = session.names.get(jidNormalizedUser(mapping.pn)) ?? number

      if (jid && name) {
        session.names.set(jid, name)
        input.database.whatsappMessages.saveContact({ accountId: account.id, jid, name })
      }
    }

    input.observability.event({ name: "plugin.whatsapplidsresolved", context: { pluginId: account.pluginId }, attributes: { count: mappings?.length ?? 0 } })
  }

  function flush(session: Session, accountId: string) {
    for (const [jid, name] of session.names) {
      input.database.whatsappMessages.saveContact({ accountId, jid, name })
    }

    for (const message of session.buffer.splice(0)) {
      input.database.whatsappMessages.save({ ...message, accountId })
    }
  }

  function live(account: PluginAccountSession) {
    const known = sessions.get(account.id)

    if (known) {
      return known
    }

    if (!account.secret) {
      throw new PluginAuthError("The WhatsApp Conta has no session")
    }

    const adopted = paired.get(account.label)
    paired.delete(account.label)
    const session = adopted ?? open({ secret: account.secret })
    session.accountId = account.id
    session.save = () => account.saveSecret(session.auth.serialize())
    sessions.set(account.id, session)
    flush(session, account.id)
    session.save()

    return session
  }

  function chatKind(chatId: string, ownNumber: string): WhatsappChatKind {
    if (chatId.endsWith("@g.us")) {
      return "group"
    }

    if (chatId.endsWith("@newsletter")) {
      return "newsletter"
    }

    if (chatId.split("@")[0] === ownNumber) {
      return "self"
    }

    return "contact"
  }

  function describeChat(chat: WhatsappChat, kind: WhatsappChatKind) {
    const last = chat.lastContent.replaceAll("\n", " ")

    return `chatId: ${chat.chatId}\nname: ${chat.chatName}\nkind: ${kind}\nlast: ${chat.lastSentAt}\nstored: ${chat.messages}\nlatest: ${chat.lastSenderName}: ${last}`
  }

  function transcript(oldest: WhatsappMessage, messages: WhatsappMessage[], kind: WhatsappChatKind) {
    const newest = messages.at(-1) ?? oldest
    const header = `chatId: ${newest.chatId}\nname: ${newest.chatName}\nkind: ${kind}\ncovers: ${oldest.sentAt} to ${newest.sentAt}, ${messages.length} messages`
    const lines = messages.map((message) => `[${message.sentAt}] ${message.senderName}: ${message.content}`)

    return [header, ...lines].join("\n")
  }

  const operations: Record<string, (account: PluginAccountSession, params: Record<string, unknown>) => Promise<string>> = {
    async whatsapp_chats(account, params) {
      const details = parse(inputs.whatsapp_chats, params)
      await resolveNames(account).catch((error: unknown) => {
        input.observability.event({ name: "plugin.whatsapplidsunresolved", context: { pluginId: account.pluginId }, attributes: { reason: error instanceof Error ? error.message : "unknown" } })
      })

      const wanted = new Set(details.kinds)
      const chats = input.database.whatsappMessages.listChats(account.id)
        .map((chat) => ({ chat, kind: chatKind(chat.chatId, account.label) }))
        .filter((entry) => wanted.has(entry.kind))
        .slice(0, details.limit)

      if (chats.length === 0) {
        return "No stored chats match. Jolt stores WhatsApp messages only while it is open."
      }

      return chats.map((entry) => describeChat(entry.chat, entry.kind)).join("\n\n")
    },
    async whatsapp_read(account, params) {
      const details = parse(inputs.whatsapp_read, params)
      const sections = details.chatIds.map((chatId) => {
        const messages = input.database.whatsappMessages.readChat(account.id, chatId, details.limit)
        const [oldest] = messages

        if (!oldest) {
          return `chatId: ${chatId}\nNo stored messages.`
        }

        return transcript(oldest, messages, chatKind(chatId, account.label))
      })

      return sections.join("\n\n")
    },
    async whatsapp_send(account, params) {
      const details = parse(inputs.whatsapp_send, params)
      const session = live(account)
      const sent = await session.socket().sendMessage(details.chatId, { text: details.text })

      if (!sent) {
        throw new Error(`WhatsApp did not confirm the message to ${details.chatId}`)
      }

      const row = incoming(sent, session.names)

      if (row) {
        input.database.whatsappMessages.save({ ...row, accountId: account.id })
      }

      return `Sent to ${details.chatId} at ${row?.sentAt ?? new Date().toISOString()}.`
    },
  }

  return {
    kind: "whatsapp",
    availability() {
      return { available: true }
    },
    tools() {
      return whatsappTools
    },
    connect(details) {
      const session = open({ secret: details.secret ?? "", step: details.step })
      const connected = session.opened.then((label) => {
        paired.set(label, session)
        input.observability.event({ name: "plugin.whatsappconnected", context: { pluginId: details.pluginId } })

        return { label, secret: session.auth.serialize(), tools: whatsappTools }
      })

      return {
        connected,
        cancel() {
          void session.close()
        },
      }
    },
    resume(account) {
      live(account)
    },
    execute(account, tool, params) {
      const operation = operations[tool.name]

      if (!operation) {
        throw new Error(`Unknown WhatsApp tool ${tool.name}`)
      }

      return input.observability.span({ name: "plugin.whatsapp", context: { pluginId: account.pluginId }, attributes: { tool: tool.name } }, () => operation(account, params))
    },
    async stop(accountId) {
      const session = sessions.get(accountId)
      sessions.delete(accountId)
      await session?.close()
    },
  }
}
