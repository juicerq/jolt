import { implement, ORPCError } from "@orpc/server"
import { engineContract } from "@src/shared/engine-contract"
import type { createDiagnostics } from "../observability/diagnostics"
import type { ObservationReceiver, Observability } from "../observability/observability"
import type { createPiProvider } from "../pi/pi-provider"
import type { createBots } from "../bots/bots"
import type { createBrowser } from "../browser/browser"
import type { createConversations } from "../conversations/conversations"
import type { createMemory } from "../memory/memory"
import type { createPlugins } from "../plugins/plugins"
import type { createProjects } from "../projects/projects"
import type { createRoutines } from "../routines/routines"
import type { createTasks } from "../tasks/tasks"
import type { createTriggers } from "../triggers/triggers"
import type { PermissionDecisionInput } from "@src/shared/permissions"

interface EngineContext { traceId?: string; spanId?: string }

function surfaced(error: unknown) {
  if (error instanceof ORPCError) {
    return error
  }

  return new ORPCError("BAD_REQUEST", { message: error instanceof Error ? error.message : "Unknown error", cause: error })
}

async function* surfacedStream<T>(stream: AsyncIterable<T>) {
  try {
    yield* stream
  } catch (error) {
    throw surfaced(error)
  }
}

export function createEngineRouter({ startedAt, observability, diagnostics, receiver, providers, bots, browser, projects, conversations, tasks, routines, triggers, memory, permissions, plugins }: {
  startedAt: string
  observability: Observability
  diagnostics: ReturnType<typeof createDiagnostics>
  receiver: ObservationReceiver
  providers: ReturnType<typeof createPiProvider>
  bots: ReturnType<typeof createBots>
  browser: Pick<ReturnType<typeof createBrowser>, "pages" | "frame">
  projects: ReturnType<typeof createProjects>
  conversations: ReturnType<typeof createConversations>
  tasks: ReturnType<typeof createTasks>
  routines: ReturnType<typeof createRoutines>
  triggers: ReturnType<typeof createTriggers>
  memory: ReturnType<typeof createMemory>
  permissions: { decide(input: PermissionDecisionInput): void }
  plugins: ReturnType<typeof createPlugins>
}) {
  const operations = implement(engineContract).$context<EngineContext>().use(async ({ next, context, path }) => {
    try {
      const operation = path.join(".").toLowerCase()

      if (operation === "diagnostics.get" || operation === "browser.frame" || operation.startsWith("observations.")) {
        return await next()
      }

      return await observability.span({ name: `orpc.${operation}`, context }, () => next())
    } catch (error) {
      throw surfaced(error)
    }
  })

  return operations.router({
    health: operations.health.handler(() => ({ status: "ready", runtime: `Bun ${Bun.version}`, startedAt })),
    diagnostics: {
      get: operations.diagnostics.get.handler(() => diagnostics.get()),
      export: operations.diagnostics.export.handler(() => diagnostics.export()),
    },
    providers: {
      login: operations.providers.login.handler(() => providers.authentication.start()),
      loginStatus: operations.providers.loginStatus.handler(({ input }) => providers.authentication.status(input)),
      loginReply: operations.providers.loginReply.handler(({ input }) => providers.authentication.reply(input)),
      cancelLogin: operations.providers.cancelLogin.handler(({ input }) => providers.authentication.cancel(input)),
      list: operations.providers.list.handler(() => providers.list()),
      models: operations.providers.models.handler(() => providers.models()),
      refreshModels: operations.providers.refreshModels.handler(() => providers.refreshModels()),
      connect: operations.providers.connect.handler(({ input }) => providers.connect(input)),
      disconnect: operations.providers.disconnect.handler(({ input }) => providers.disconnect(input)),
    },
    projects: {
      create: operations.projects.create.handler(({ input }) => projects.create(input)),
      list: operations.projects.list.handler(() => projects.list()),
    },
    bots: {
      addMember: operations.bots.addMember.handler(({ input }) => bots.addMember(input)),
      detachMember: operations.bots.detachMember.handler(({ input }) => bots.detachMember(input)),
      create: operations.bots.create.handler(({ input }) => bots.create(input)),
      list: operations.bots.list.handler(() => bots.list()),
      get: operations.bots.get.handler(({ input }) => {
        const bot = bots.get(input)

        if (!bot) {
          throw new ORPCError("NOT_FOUND", { message: "Bot not found" })
        }

        return bot
      }),
      update: operations.bots.update.handler(({ input }) => bots.update(input)),
      updateExecution: operations.bots.updateExecution.handler(({ input }) => bots.updateExecution(input)),
      remove: operations.bots.remove.handler(({ input }) => bots.remove(input)),
      removeColleague: operations.bots.removeColleague.handler(({ input }) => bots.removeColleague(input)),
    },
    conversations: {
      overview: operations.conversations.overview.handler(() => conversations.overview()),
      history: operations.conversations.history.handler(({ input }) => conversations.history(input)),
      events: operations.conversations.events.handler(({ signal }) => surfacedStream(conversations.events(signal))),
      send: operations.conversations.send.handler(({ input }) => conversations.send(input)),
      compact: operations.conversations.compact.handler(({ input }) => conversations.compact(input)),
      abort: operations.conversations.abort.handler(({ input }) => conversations.abort(input)),
      abortTeam: operations.conversations.abortTeam.handler(({ input }) => conversations.abortTeam(input)),
      teamWorking: operations.conversations.teamWorking.handler(({ input }) => conversations.teamWorking(input)),
      promote: operations.conversations.promote.handler(({ input }) => conversations.promote(input)),
      unqueue: operations.conversations.unqueue.handler(({ input }) => conversations.unqueue(input)),
      related: operations.conversations.related.handler(({ input }) => conversations.related(input)),
    },
    browser: {
      pages: operations.browser.pages.handler(({ signal }) => surfacedStream(browser.pages(signal))),
      frame: operations.browser.frame.handler(({ input, signal }) => browser.frame(input, signal)),
    },
    permissions: {
      decide: operations.permissions.decide.handler(({ input }) => permissions.decide(input)),
    },
    tasks: {
      listForBot: operations.tasks.listForBot.handler(({ input }) => tasks.listForBot(input)),
    },
    routines: {
      create: operations.routines.create.handler(({ input }) => routines.create(input)),
      list: operations.routines.list.handler(({ input }) => routines.list(input)),
      update: operations.routines.update.handler(({ input }) => routines.update(input)),
      remove: operations.routines.remove.handler(({ input }) => routines.remove(input)),
    },
    triggers: {
      create: operations.triggers.create.handler(({ input }) => triggers.create(input)),
      list: operations.triggers.list.handler(({ input }) => triggers.list(input)),
      update: operations.triggers.update.handler(({ input }) => triggers.update(input)),
      remove: operations.triggers.remove.handler(({ input }) => triggers.remove(input)),
    },
    memory: {
      settings: operations.memory.settings.handler(() => memory.settings()),
      configure: operations.memory.configure.handler(({ input }) => memory.configure(input)),
      status: operations.memory.status.handler(() => memory.status()),
      retry: operations.memory.retry.handler(({ input }) => memory.retry(input)),
      list: operations.memory.list.handler(({ input }) => memory.list(input)),
      add: operations.memory.add.handler(({ input }) => memory.add(input)),
      update: operations.memory.update.handler(({ input }) => memory.update(input)),
      forget: operations.memory.forget.handler(({ input }) => memory.forget(input)),
      clear: operations.memory.clear.handler(({ input }) => memory.clear(input)),
    },
    plugins: {
      list: operations.plugins.list.handler(() => plugins.list()),
      addCustom: operations.plugins.addCustom.handler(({ input }) => plugins.addCustom(input)),
      remove: operations.plugins.remove.handler(({ input }) => plugins.remove(input)),
      connect: operations.plugins.connect.handler(({ input }) => plugins.connect(input)),
      connectionSteps: operations.plugins.connectionSteps.handler(({ input, signal }) => surfacedStream(plugins.connectionSteps(input, signal))),
      awaitConnection: operations.plugins.awaitConnection.handler(({ input }) => plugins.awaitConnection(input)),
      disconnect: operations.plugins.disconnect.handler(({ input }) => plugins.disconnect(input)),
      grant: operations.plugins.grant.handler(({ input }) => plugins.grant(input)),
      decide: operations.plugins.decide.handler(({ input }) => plugins.decide(input)),
    },
    observations: {
      rendererSpan: operations.observations.rendererSpan.handler(({ input }) => receiver.span(input)),
    },
  })
}
