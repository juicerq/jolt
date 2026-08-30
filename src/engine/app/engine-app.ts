import { implement } from "@orpc/server"
import { engineContract } from "../../shared/engine-contract"

export function createEngineRouter(startedAt: string) {
  const operations = implement(engineContract)

  return operations.router({
    health: operations.health.handler(() => ({
      status: "ready",
      runtime: `Bun ${Bun.version}`,
      startedAt,
    })),
  })
}
