import { describe, expect, test } from "bun:test"
import { pluginRequestDetail, pluginRequestTitle } from "@src/renderer/src/chat/chat-plugin-request"

const ana = { id: "a1", label: "ana@example.com", state: "connected" as const }
const expired = { id: "a1", label: "ana@example.com", state: "needs-auth" as const }

describe("ChatPluginRequest", () => {
  test("titles a first connection, a choice between Contas, and a reconnection", () => {
    expect(pluginRequestTitle({ pluginName: "Gmail", accounts: [] })).toBe("Conectar Gmail")
    expect(pluginRequestTitle({ pluginName: "Gmail", accounts: [ana, expired] })).toBe("Conectar Gmail")
    expect(pluginRequestTitle({ pluginName: "Gmail", accounts: [expired] })).toBe("Reconectar Gmail")
  })

  test("explains what the person must do", () => {
    expect(pluginRequestDetail({ pluginName: "Gmail", accounts: [], connectable: true })).toBe("O Bot precisa de uma Conta de Gmail.")
    expect(pluginRequestDetail({ pluginName: "Gmail", accounts: [ana], connectable: true })).toBe("Escolha a Conta de Gmail que o Bot pode usar.")
    expect(pluginRequestDetail({ pluginName: "Gmail", accounts: [], connectable: false })).toBe("Gmail não está configurado neste computador.")
  })
})
