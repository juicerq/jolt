import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"

const server = new McpServer({ name: "echo", version: "1.0.0" })

server.registerTool("say hello", { description: "Says hello", inputSchema: { name: z.string() } }, async ({ name }) => ({
  content: [{ type: "text", text: `hello ${name} from ${process.env.ECHO_TOKEN ?? "nobody"}` }],
}))
server.registerTool("fail", { description: "Always fails", inputSchema: {} }, async () => ({ isError: true, content: [{ type: "text", text: "boom" }] }))

await server.connect(new StdioServerTransport())
