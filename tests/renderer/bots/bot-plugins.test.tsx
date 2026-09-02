import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { BotPluginList, pluginsWithAccounts } from "@src/renderer/src/bots/bot-plugins"
import type { Plugin } from "@src/shared/plugins"

const gmail: Plugin = { id: "gmail", kind: "gmail", name: "Gmail", builtIn: true, available: true, accounts: [
  { id: "a1", pluginId: "gmail", label: "ana@example.com", state: "connected", tools: ["gmail_search"], botIds: ["b1"], checkedAt: "" },
  { id: "a2", pluginId: "gmail", label: "bob@example.com", state: "connected", tools: ["gmail_search"], botIds: [], checkedAt: "" },
] }
const linear: Plugin = { id: "p1", kind: "mcp", name: "Linear", builtIn: false, available: true, config: { command: "npx linear-mcp", envNames: [] }, accounts: [] }

describe("BotPlugins", () => {
  test("lists only Plugins with Contas and marks the one the Bot uses", () => {
    expect(pluginsWithAccounts([gmail, linear]).map((plugin) => plugin.id)).toEqual(["gmail"])

    const markup = renderToStaticMarkup(<BotPluginList bot={{ id: "b1" }} plugins={[gmail, linear]} busy={false} onGrant={() => {}} />)
    expect(markup).toContain('aria-label="Usar ana@example.com" type="button" role="switch" aria-checked="true"')
    expect(markup).toContain('aria-label="Usar bob@example.com" type="button" role="switch" aria-checked="false"')
    expect(markup).not.toContain("Linear")
  })

  test("without Contas it points to the conversation and the Plugins screen", () => {
    expect(renderToStaticMarkup(<BotPluginList bot={{ id: "b1" }} plugins={[linear]} busy={false} onGrant={() => {}} />)).toContain("Nenhuma Conta conectada ainda")
  })
})
