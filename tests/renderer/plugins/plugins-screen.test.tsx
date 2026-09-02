import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { parseEnvironment } from "@src/renderer/src/plugins/add-plugin-dialog"
import { describeAccount, PluginAccountRow } from "@src/renderer/src/plugins/plugin-account-row"
import { describePlugin } from "@src/renderer/src/plugins/plugins-screen"

describe("Plugins screen", () => {
  test("describes a Plugin by availability, kind, and Contas", () => {
    expect(describePlugin({ kind: "gmail", available: false, unavailableReason: "Gmail needs a Google client id.", accounts: [] })).toBe("Gmail needs a Google client id.")
    expect(describePlugin({ kind: "gmail", available: true, accounts: [] })).toBe("Nenhuma Conta conectada")
    expect(describePlugin({ kind: "gmail", available: true, accounts: [{ id: "a", pluginId: "gmail", label: "ana@example.com", state: "connected", tools: [], botIds: [], checkedAt: "" }] })).toBe("1 Conta conectada")
    expect(describePlugin({ kind: "mcp", available: true, config: { command: "npx linear-mcp", envNames: [] }, accounts: [] })).toBe("Servidor MCP · npx linear-mcp")
  })

  test("a Conta row shows its state and how many Bots use it", () => {
    expect(describeAccount({ state: "connected", botIds: [] })).toBe("Conectada · Nenhum Bot usa")
    expect(describeAccount({ state: "needs-auth", botIds: ["b1"] })).toBe("Precisa autenticar · 1 Bot usa")
    expect(describeAccount({ state: "failed", botIds: ["b1", "b2"] })).toBe("Com falha · 2 Bots usam")

    const markup = renderToStaticMarkup(<ul><PluginAccountRow account={{ label: "ana@example.com", state: "needs-auth", botIds: ["b1"] }} actions={<button type="button">Reconectar</button>} /></ul>)
    expect(markup).toContain("ana@example.com")
    expect(markup).toContain('aria-label="Precisa autenticar"')
    expect(markup).toContain("Reconectar")
  })

  test("environment lines become NOME=valor pairs and broken lines are ignored", () => {
    expect(parseEnvironment("LINEAR_API_KEY=lin_api_1\n\nBROKEN\n=novalue\nURL=https://a.b/c?x=1=2 ")).toEqual({ LINEAR_API_KEY: "lin_api_1", URL: "https://a.b/c?x=1=2" })
  })
})
