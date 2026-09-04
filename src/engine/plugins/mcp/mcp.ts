import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { z } from "zod"
import { parse } from "../../../shared/parse"
import { pluginSchemas, type StoredPlugin, type ToolDescriptor } from "../../../shared/plugins"
import type { Observability } from "../../observability/observability"
import { slugify, type PluginAdapter } from "../plugin-adapter"

const environmentSchema = z.record(z.string(), z.string())

interface Server { client: Client; tools: Promise<ToolDescriptor[]> }

function inheritedEnvironment() {
  return Object.fromEntries(["PATH", "HOME", "USER", "TMPDIR", "LANG"].flatMap((name) => (process.env[name] ? [[name, process.env[name]]] : [])))
}

function textOf(result: Awaited<ReturnType<Client["callTool"]>>) {
  const content = Array.isArray(result.content) ? result.content : []
  const parts = content.map((part) => (part.type === "text" ? part.text : `[${part.type}]`))
  const text = parts.join("\n") || JSON.stringify(result.structuredContent ?? {})

  if (result.isError) {
    throw new Error(text)
  }

  return text
}

export function createMcpAdapter(input: { observability: Observability }): PluginAdapter {
  const servers = new Map<string, Server>()

  async function start(key: string, name: string, config: StoredPlugin["config"], secret: string): Promise<Server> {
    const [command, ...args] = config.command.split(/\s+/).filter(Boolean)

    if (!command) {
      throw new Error("The Plugin has no command")
    }

    const env = { ...inheritedEnvironment(), ...parse(environmentSchema, JSON.parse(secret || "{}")) }
    const client = new Client({ name: "jolt", version: "1.0.0" })
    const prefix = `${slugify(name)}_`
    const transport = new StdioClientTransport({ command, args, env, stderr: "ignore" })
    client.onclose = () => {
      if (servers.get(key)?.client === client) {
        servers.delete(key)
        input.observability.event({ name: "plugin.mcpclosed", context: { pluginId: key } })
      }
    }

    await client.connect(transport)
    const tools = client.listTools().then((listed) => parse(pluginSchemas.toolDescriptorList, listed.tools.map((tool) => ({
      name: `${prefix}${slugify(tool.name)}`,
      label: tool.name,
      description: tool.description ?? tool.name,
      inputSchema: tool.inputSchema,
    }))))
    const server = { client, tools }
    servers.set(key, server)

    return server
  }

  async function serverFor(account: Parameters<PluginAdapter["execute"]>[0]) {
    const running = servers.get(account.id)

    if (running) {
      return running
    }

    if (!account.config) {
      throw new Error("The Plugin has no command")
    }

    return start(account.id, account.label, account.config, account.secret)
  }

  async function stop(key: string) {
    const server = servers.get(key)

    if (!server) {
      return
    }

    servers.delete(key)
    await server.client.close().catch(() => {})
  }

  return {
    kind: "mcp",
    availability() {
      return { available: true }
    },
    connect(details) {
      const key = `connect:${details.pluginId}`
      const secret = details.secret ?? "{}"
      const connected = (async () => {
        if (!details.config) {
          throw new Error("The Plugin has no command")
        }

        const server = await start(key, details.name, details.config, secret)

        try {
          return { label: details.name, secret, tools: await server.tools }
        } finally {
          await stop(key)
        }
      })()

      return {
        connected,
        cancel() {
          void stop(key)
        },
      }
    },
    async execute(account, tool, params, signal) {
      const server = await serverFor(account)
      const result = await server.client.callTool({ name: tool.label, arguments: params }, undefined, (signal ? { signal } : {}))

      return textOf(result)
    },
    stop,
  }
}
