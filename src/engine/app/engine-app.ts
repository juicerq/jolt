import { implement, ORPCError } from "@orpc/server"
import { engineContract } from "../../shared/engine-contract"
import type { createDiagnostics } from "../observability/diagnostics"
import type { ObservationReceiver, Observability } from "../observability/observability"
import type { createPiProvider } from "../pi/pi-provider"
import type { createBots } from "../bots/bots"
import type { createConversations } from "../conversations/conversations"
import type { createMemory } from "../memory/memory"
import type { createPlugins } from "../plugins/plugins"
import type { createProjects } from "../projects/projects"
import type { createRoutines } from "../routines/routines"
import type { createTasks } from "../tasks/tasks"
import type { PermissionDecisionInput } from "../../shared/permissions"

type EngineContext = { traceId?: string; spanId?: string }

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

function observationContext(context: EngineContext) {
  return {
    ...(context.traceId ? { traceId: context.traceId } : {}),
    ...(context.spanId ? { spanId: context.spanId } : {}),
  }
}

export function createEngineRouter(
  startedAt: string,
  observability: Observability,
  diagnostics: ReturnType<typeof createDiagnostics>,
  receiver: ObservationReceiver,
  providers: ReturnType<typeof createPiProvider>,
  bots: ReturnType<typeof createBots>,
  projects: ReturnType<typeof createProjects>,
  conversations: ReturnType<typeof createConversations>,
  tasks: ReturnType<typeof createTasks>,
  routines: ReturnType<typeof createRoutines>,
  memory: ReturnType<typeof createMemory>,
  permissions: { decide(input: PermissionDecisionInput): void },
  plugins: ReturnType<typeof createPlugins>,
) {
  const operations = implement(engineContract).use(async ({ next }) => {
    try {
      return await next()
    } catch (error) {
      throw surfaced(error)
    }
  })

  return operations.router({
    health: operations.health.handler(({ context }: { context: EngineContext }) =>
      observability.span({ name: "orpc.health", context: observationContext(context) }, () => ({
        status: "ready",
        runtime: `Bun ${Bun.version}`,
        startedAt,
      })),
    ),
    diagnostics: {
      get: operations.diagnostics.get.handler(() => diagnostics.get()),
      export: operations.diagnostics.export.handler(({ context }: { context: EngineContext }) =>
        observability.span(
          { name: "orpc.diagnosticexport", context: observationContext(context) },
          () => diagnostics.export(),
        ),
      ),
    },
    providers: {
      list: operations.providers.list.handler(({ context }: { context: EngineContext }) =>
        observability.span(
          { name: "orpc.providerlist", context: observationContext(context) },
          () => providers.list(),
        ),
      ),
      models: operations.providers.models.handler(({ context }: { context: EngineContext }) =>
        observability.span(
          { name: "orpc.providermodels", context: observationContext(context) },
          () => providers.models(),
        ),
      ),
    },
    projects: {
      create: operations.projects.create.handler(({ context, input }: { context: EngineContext; input: unknown }) =>
        observability.span(
          { name: "orpc.projectcreate", context: observationContext(context) },
          () => projects.create(input),
        ),
      ),
      list: operations.projects.list.handler(({ context }: { context: EngineContext }) =>
        observability.span(
          { name: "orpc.projectlist", context: observationContext(context) },
          () => projects.list(),
        ),
      ),
    },
    bots: {
      create: operations.bots.create.handler(({ context, input }: { context: EngineContext; input: unknown }) =>
        observability.span(
          { name: "orpc.botcreate", context: observationContext(context) },
          () => bots.create(input),
        ),
      ),
      list: operations.bots.list.handler(({ context }: { context: EngineContext }) =>
        observability.span(
          { name: "orpc.botlist", context: observationContext(context) },
          () => bots.list(),
        ),
      ),
      get: operations.bots.get.handler(({ context, input }: { context: EngineContext; input: unknown }) =>
        observability.span(
          { name: "orpc.botget", context: observationContext(context) },
          () => {
            const bot = bots.get(input)

            if (!bot) {
              throw new Error("Bot not found")
            }

            return bot
          },
        ),
      ),
      update: operations.bots.update.handler(({ context, input }: { context: EngineContext; input: unknown }) =>
        observability.span(
          { name: "orpc.botupdate", context: observationContext(context) },
          () => bots.update(input),
        ),
      ),
      updateExecution: operations.bots.updateExecution.handler(({ context, input }: { context: EngineContext; input: unknown }) =>
        observability.span(
          { name: "orpc.botexecutionupdate", context: observationContext(context) },
          () => bots.updateExecution(input),
        ),
      ),
      remove: operations.bots.remove.handler(({ context, input }: { context: EngineContext; input: unknown }) =>
        observability.span(
          { name: "orpc.botremove", context: observationContext(context) },
          () => bots.remove(input),
        ),
      ),
      removeColleague: operations.bots.removeColleague.handler(({ context, input }: { context: EngineContext; input: unknown }) =>
        observability.span(
          { name: "orpc.botcolleagueremove", context: observationContext(context) },
          () => bots.removeColleague(input),
        ),
      ),
    },
    conversations: {
      history: operations.conversations.history.handler(({ context, input }: { context: EngineContext; input: unknown }) =>
        observability.span(
          { name: "orpc.conversationhistory", context: observationContext(context) },
          () => conversations.history(input),
        ),
      ),
      events: operations.conversations.events.handler(() => surfacedStream(conversations.events())),
      send: operations.conversations.send.handler(({ context, input }: { context: EngineContext; input: unknown }) =>
        observability.span(
          { name: "orpc.conversationsend", context: observationContext(context) },
          () => conversations.send(input),
        ),
      ),
      compact: operations.conversations.compact.handler(({ context, input }: { context: EngineContext; input: unknown }) =>
        observability.span(
          { name: "orpc.conversationcompact", context: observationContext(context) },
          () => conversations.compact(input),
        ),
      ),
      abort: operations.conversations.abort.handler(({ context, input }: { context: EngineContext; input: unknown }) =>
        observability.span(
          { name: "orpc.conversationabort", context: observationContext(context) },
          () => conversations.abort(input),
        ),
      ),
      promote: operations.conversations.promote.handler(({ context, input }: { context: EngineContext; input: unknown }) =>
        observability.span(
          { name: "orpc.conversationpromote", context: observationContext(context) },
          () => conversations.promote(input),
        ),
      ),
      unqueue: operations.conversations.unqueue.handler(({ context, input }: { context: EngineContext; input: unknown }) =>
        observability.span(
          { name: "orpc.conversationunqueue", context: observationContext(context) },
          () => conversations.unqueue(input),
        ),
      ),
      related: operations.conversations.related.handler(({ context, input }: { context: EngineContext; input: unknown }) =>
        observability.span(
          { name: "orpc.conversationrelated", context: observationContext(context) },
          () => conversations.related(input),
        ),
      ),
    },
    permissions: {
      decide: operations.permissions.decide.handler(({ context, input }: { context: EngineContext; input: PermissionDecisionInput }) =>
        observability.span(
          { name: "orpc.permissiondecide", context: observationContext(context) },
          () => permissions.decide(input),
        ),
      ),
    },
    tasks: {
      listForBot: operations.tasks.listForBot.handler(({ context, input }: { context: EngineContext; input: unknown }) =>
        observability.span(
          { name: "orpc.tasklist", context: observationContext(context) },
          () => tasks.listForBot(input),
        ),
      ),
    },
    routines: {
      create: operations.routines.create.handler(({ context, input }: { context: EngineContext; input: unknown }) =>
        observability.span(
          { name: "orpc.routinecreate", context: observationContext(context) },
          () => routines.create(input),
        ),
      ),
      list: operations.routines.list.handler(({ context, input }: { context: EngineContext; input: unknown }) =>
        observability.span(
          { name: "orpc.routinelist", context: observationContext(context) },
          () => routines.list(input),
        ),
      ),
      update: operations.routines.update.handler(({ context, input }: { context: EngineContext; input: unknown }) =>
        observability.span(
          { name: "orpc.routineupdate", context: observationContext(context) },
          () => routines.update(input),
        ),
      ),
      remove: operations.routines.remove.handler(({ context, input }: { context: EngineContext; input: unknown }) =>
        observability.span(
          { name: "orpc.routineremove", context: observationContext(context) },
          () => routines.remove(input),
        ),
      ),
    },
    memory: {
      list: operations.memory.list.handler(({ context, input }: { context: EngineContext; input: unknown }) =>
        observability.span(
          { name: "orpc.memorylist", context: observationContext(context) },
          () => memory.list(input),
        ),
      ),
      add: operations.memory.add.handler(({ context, input }: { context: EngineContext; input: unknown }) =>
        observability.span(
          { name: "orpc.memoryadd", context: observationContext(context) },
          () => memory.add(input),
        ),
      ),
      update: operations.memory.update.handler(({ context, input }: { context: EngineContext; input: unknown }) =>
        observability.span(
          { name: "orpc.memoryupdate", context: observationContext(context) },
          () => memory.update(input),
        ),
      ),
      forget: operations.memory.forget.handler(({ context, input }: { context: EngineContext; input: unknown }) =>
        observability.span(
          { name: "orpc.memoryforget", context: observationContext(context) },
          () => memory.forget(input),
        ),
      ),
      clear: operations.memory.clear.handler(({ context, input }: { context: EngineContext; input: unknown }) =>
        observability.span(
          { name: "orpc.memoryclear", context: observationContext(context) },
          () => memory.clear(input),
        ),
      ),
    },
    plugins: {
      list: operations.plugins.list.handler(({ context }: { context: EngineContext }) =>
        observability.span(
          { name: "orpc.pluginlist", context: observationContext(context) },
          () => plugins.list(),
        ),
      ),
      addCustom: operations.plugins.addCustom.handler(({ context, input }: { context: EngineContext; input: unknown }) =>
        observability.span(
          { name: "orpc.pluginaddcustom", context: observationContext(context) },
          () => plugins.addCustom(input),
        ),
      ),
      remove: operations.plugins.remove.handler(({ context, input }: { context: EngineContext; input: unknown }) =>
        observability.span(
          { name: "orpc.pluginremove", context: observationContext(context) },
          () => plugins.remove(input),
        ),
      ),
      connect: operations.plugins.connect.handler(({ context, input }: { context: EngineContext; input: unknown }) =>
        observability.span(
          { name: "orpc.pluginconnect", context: observationContext(context) },
          () => plugins.connect(input),
        ),
      ),
      connectionSteps: operations.plugins.connectionSteps.handler(({ input }: { input: unknown }) => surfacedStream(plugins.connectionSteps(input))),
      awaitConnection: operations.plugins.awaitConnection.handler(({ context, input }: { context: EngineContext; input: unknown }) =>
        observability.span(
          { name: "orpc.pluginawaitconnection", context: observationContext(context) },
          () => plugins.awaitConnection(input),
        ),
      ),
      disconnect: operations.plugins.disconnect.handler(({ context, input }: { context: EngineContext; input: unknown }) =>
        observability.span(
          { name: "orpc.plugindisconnect", context: observationContext(context) },
          () => plugins.disconnect(input),
        ),
      ),
      grant: operations.plugins.grant.handler(({ context, input }: { context: EngineContext; input: unknown }) =>
        observability.span(
          { name: "orpc.plugingrant", context: observationContext(context) },
          () => plugins.grant(input),
        ),
      ),
      decide: operations.plugins.decide.handler(({ context, input }: { context: EngineContext; input: unknown }) =>
        observability.span(
          { name: "orpc.plugindecide", context: observationContext(context) },
          () => plugins.decide(input),
        ),
      ),
    },
    observations: {
      rendererSpan: operations.observations.rendererSpan.handler(({ input }) => receiver.span(input)),
    },
  })
}
