import { afterAll, afterEach, expect, test } from "bun:test"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderToStaticMarkup } from "react-dom/server"
import { createEngineClient } from "@src/renderer/src/engine-client"
import type { ProjectGroups } from "@src/shared/projects"

const clients: QueryClient[] = []
const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage")
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: () => null } })
const { BotChat } = await import("@src/renderer/src/bots/bot-chat")

afterAll(() => {
  if (storageDescriptor) {
    Object.defineProperty(globalThis, "localStorage", storageDescriptor)
    return
  }

  Reflect.deleteProperty(globalThis, "localStorage")
})

afterEach(() => {
  for (const client of clients.splice(0)) {
    client.clear()
  }
})

test.each(["vazio", "com Bot", "com Bot em Projeto"])("abertura com histórico %s aguarda os dados antes de decidir as boas-vindas", async (state) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  clients.push(queryClient)
  const client = createEngineClient({ url: "http://127.0.0.1:1", token: "test" })
  const options = client.query.projects.list.queryOptions()
  const result = Promise.withResolvers<ProjectGroups>()
  const loading = queryClient.fetchQuery({ ...options, queryFn: () => result.promise })
  const render = () => renderToStaticMarkup(<QueryClientProvider client={queryClient}><BotChat client={client} botId={null} /></QueryClientProvider>)

  const bot: ProjectGroups["unassignedBots"][number] = {
    id: "bot", name: "Assistente", avatarSeed: "bot", leaderBotId: null, projectId: null,
    provider: "codex", function: { outcome: "Ajudar" }, workingDirectoryOverride: null,
    effectiveWorkingDirectory: "/tmp", temporary: false, memoryEnabled: true, effort: "medium",
    model: null, permissionMode: "ask", createdAt: "2026-09-06T00:00:00.000Z", closed: false,
    colleagueIds: [], members: [],
  }
  const groups: Record<string, ProjectGroups> = {
    vazio: { projects: [], unassignedBots: [] },
    "com Bot": { projects: [], unassignedBots: [bot] },
    "com Bot em Projeto": { projects: [{ id: "project", name: "Projeto", defaultWorkingDirectory: null, createdAt: bot.createdAt, bots: [{ ...bot, projectId: "project" }] }], unassignedBots: [] },
  }
  try {
    expect(render()).toContain("Carregando Bots...")
    expect(render()).not.toContain("Crie seu primeiro Bot")
  } finally {
    result.resolve(groups[state])
    await loading
  }

  expect(render()).toContain(state === "vazio" ? "Crie seu primeiro Bot" : "Escolha um Bot")
  expect(render()).not.toContain("Carregando Bots...")
})

test("falha ao carregar Bots não oferece onboarding", async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false } } })
  clients.push(queryClient)
  const client = createEngineClient({ url: "http://127.0.0.1:1", token: "test" })
  await queryClient.fetchQuery({ ...client.query.projects.list.queryOptions(), queryFn: async () => { throw new Error("Engine indisponível") } }).catch(() => {})
  const markup = renderToStaticMarkup(<QueryClientProvider client={queryClient}><BotChat client={client} botId={null} /></QueryClientProvider>)

  expect(markup).toContain("Falha ao carregar os Bots: Engine indisponível")
  expect(markup).not.toContain("Crie seu primeiro Bot")
})
