import { BufferJSON, initAuthCreds, proto, type AuthenticationCreds, type AuthenticationState, type SignalDataTypeMap } from "baileys"

type Keys = Record<string, Record<string, unknown>>

export function whatsappAuth(secret: string) {
  const stored: unknown = secret ? JSON.parse(secret, BufferJSON.reviver) : undefined
  const restored = stored as { creds?: AuthenticationCreds; keys?: Keys } | undefined
  const creds = restored?.creds ?? initAuthCreds()
  const keys: Keys = restored?.keys ?? {}

  const state: AuthenticationState = {
    creds,
    keys: {
      get(type, ids) {
        const bucket = keys[type] ?? {}

        return Object.fromEntries(ids.flatMap((id) => {
          const value = bucket[id]

          if (value === undefined) {
            return []
          }

          return [[id, type === "app-state-sync-key" ? proto.Message.AppStateSyncKeyData.fromObject(value as object) : value]]
        })) as { [id: string]: SignalDataTypeMap[typeof type] }
      },
      set(data) {
        for (const [type, values] of Object.entries(data)) {
          const bucket = keys[type] ?? {}

          for (const [id, value] of Object.entries(values ?? {})) {
            if (value === null) {
              delete bucket[id]

              continue
            }

            bucket[id] = value
          }

          keys[type] = bucket
        }
      },
    },
  }

  return {
    state,
    serialize() {
      return JSON.stringify({ creds, keys }, BufferJSON.replacer)
    },
  }
}
