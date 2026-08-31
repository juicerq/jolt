import { implement } from "@orpc/server"
import { engineContract } from "../../shared/engine-contract"
import type { createDiagnostics } from "../observability/diagnostics"
import type { ObservationReceiver, Observability } from "../observability/observability"
import type { createPiProvider } from "../pi/pi-provider"
import type { createBots } from "../bots/bots"
import type { createConversations } from "../conversations/conversations"
import type { createProjects } from "../projects/projects"

type EngineContext = { traceId?: string; spanId?: string }

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
) {
  const operations = implement(engineContract)

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
      updateWorkspace: operations.bots.updateWorkspace.handler(({ context, input }: { context: EngineContext; input: unknown }) =>
        observability.span(
          { name: "orpc.botworkspaceupdate", context: observationContext(context) },
          () => bots.updateWorkspace(input),
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
      send: operations.conversations.send.handler(({ input }: { input: unknown }) => conversations.send(input)),
      abort: operations.conversations.abort.handler(({ context, input }: { context: EngineContext; input: unknown }) =>
        observability.span(
          { name: "orpc.conversationabort", context: observationContext(context) },
          () => conversations.abort(input),
        ),
      ),
    },
    observations: {
      rendererSpan: operations.observations.rendererSpan.handler(({ input }) => receiver.span(input)),
    },
  })
}
