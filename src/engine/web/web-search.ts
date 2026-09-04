import { z } from "zod"
import type { Bot } from "@src/shared/bots"
import { parse } from "@src/shared/parse"
import type { Observability } from "../observability/observability"
import type { PiSchemaTool } from "../pi/pi-agent-runtime"

export const webSearchTool = "web_search"
export const webFetchTool = "web_fetch"

const endpoint = "https://search.parallel.ai/mcp"
const timeoutMs = 25_000
const searchExcerptCap = 1_200
const pageExcerptCap = 20_000

const inputs = {
  search: z.object({ query: z.string().min(1) }),
  fetch: z.object({ url: z.url({ protocol: /^https?$/ }), objective: z.string().min(1) }),
}
const found = z.looseObject({
  results: z.array(z.looseObject({
    url: z.string(),
    title: z.string().nullish(),
    publish_date: z.string().nullish(),
    excerpts: z.array(z.string()).default([]),
  })).default([]),
}).pipe(z.transform((data) => ({
  results: data.results.map((result) => ({ url: result.url, title: result.title, publishDate: result.publish_date, excerpts: result.excerpts })),
})))
const answer = z.looseObject({
  error: z.looseObject({ message: z.string().optional() }).optional(),
  result: z.looseObject({
    content: z.array(z.looseObject({ text: z.string().optional() })).default([]),
    isError: z.boolean().optional(),
  }).optional(),
})

function readJson(text: string) {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return
  }
}

function shape(text: string, cap: number) {
  const parsed = found.safeParse(readJson(text))

  if (!parsed.success || parsed.data.results.length === 0) {
    return text
  }

  return parsed.data.results.map((result, index) => {
    const excerpt = result.excerpts.join("\n").replaceAll(/\n{3,}/g, "\n\n").trim()
    const body = excerpt.length > cap ? `${excerpt.slice(0, cap)}… (cut here, read the page with web_fetch when you need the rest)` : excerpt

    return [`${index + 1}. ${result.title ?? result.url}`, result.url, result.publishDate, body].filter(Boolean).join("\n")
  }).join("\n\n")
}

function payload(body: string) {
  const trimmed = body.trim()

  if (trimmed.startsWith("{")) {
    return trimmed
  }

  const line = trimmed.split("\n").find((candidate) => candidate.startsWith("data: "))

  if (!line) {
    throw new Error("The web service answered in an unknown format")
  }

  return line.slice("data: ".length)
}

async function call(tool: string, args: Record<string, unknown>, signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(timeoutMs)
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "user-agent": "jolt" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: tool, arguments: args } }),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  })

  if (!response.ok) {
    throw new Error(`The web service answered ${response.status}. Tell the person it is unavailable right now.`)
  }

  const body = parse(answer, JSON.parse(payload(await response.text())))
  const result = body.result

  if (!result) {
    throw new Error(body.error?.message ?? "The web service failed")
  }

  const text = result.content.find((item) => item.text)?.text

  if (result.isError) {
    throw new Error(text ?? "The web service failed")
  }

  if (!text) {
    throw new Error("The web service found nothing for that")
  }

  return text
}

export function createWebSearch(input: { observability: Observability }) {
  type WebBot = Pick<Bot, "id" | "model">

  function caller(bot: WebBot) {
    return { session_id: bot.id, ...(bot.model ? { model_name: bot.model } : {}) }
  }

  return {
    tools(bot: WebBot): PiSchemaTool[] {
      return [
        {
          name: webSearchTool,
          label: "Pesquisa na web",
          description: "Search the web and get ranked pages with excerpts, usually enough to answer without reading the page. Use it whenever the answer depends on current facts, on recent events, or on documentation you cannot read from your working directory.",
          inputSchema: {
            type: "object",
            properties: { query: { type: "string", description: "What you are looking for, in a few words." } },
            required: ["query"],
          },
          async execute(params, signal) {
            const { query } = parse(inputs.search, params)

            const text = await input.observability.span({ name: "web.search", context: { botId: bot.id } }, () => call(webSearchTool, { objective: query, search_queries: [query], ...caller(bot) }, signal))

            return shape(text, searchExcerptCap)
          },
        },
        {
          name: webFetchTool,
          label: "Leitura de página",
          description: "Read one web page as markdown. Use it after web_search when the excerpt is not enough, or when the person gives you a link.",
          inputSchema: {
            type: "object",
            properties: {
              url: { type: "string", description: "Full address of the page, starting with http or https." },
              objective: { type: "string", description: "What you want from the page. It decides which parts come back." },
            },
            required: ["url", "objective"],
          },
          async execute(params, signal) {
            const { url, objective } = parse(inputs.fetch, params)

            const text = await input.observability.span({ name: "web.fetch", context: { botId: bot.id } }, () => call(webFetchTool, { urls: [url], objective, ...caller(bot) }, signal))

            return shape(text, pageExcerptCap)
          },
        },
      ]
    },
    instructions() {
      return "You reach the web with web_search and read a page with web_fetch. Prefer them over guessing when the answer depends on current facts, and name the source you used."
    },
  }
}
