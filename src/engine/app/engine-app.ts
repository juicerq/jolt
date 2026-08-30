import { implement } from "@orpc/server"
import { engineContract } from "../../shared/engine-contract"
import type { createDiagnostics } from "../observability/diagnostics"
import type { ObservationReceiver, Observability } from "../observability/observability"
import type { createProviderDiscovery } from "../providers/provider-discovery"
import type { createTeams } from "../teams/teams"

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
  providers: ReturnType<typeof createProviderDiscovery>,
  teams: ReturnType<typeof createTeams>,
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
    teams: {
      create: operations.teams.create.handler(({ context, input }: { context: EngineContext; input: unknown }) =>
        observability.span(
          { name: "orpc.teamcreate", context: observationContext(context) },
          () => teams.create(input),
        ),
      ),
      list: operations.teams.list.handler(({ context }: { context: EngineContext }) =>
        observability.span(
          { name: "orpc.teamlist", context: observationContext(context) },
          () => teams.list(),
        ),
      ),
      get: operations.teams.get.handler(({ context, input }: { context: EngineContext; input: unknown }) =>
        observability.span(
          { name: "orpc.teamget", context: observationContext(context) },
          () => {
            const team = teams.get(input)

            if (!team) {
              throw new Error("Team not found")
            }

            return team
          },
        ),
      ),
    },
    observations: {
      rendererSpan: operations.observations.rendererSpan.handler(({ input }) => receiver.span(input)),
    },
  })
}
