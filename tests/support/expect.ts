import { expect } from "bun:test"

export function must<T>(value: T | null | undefined, description = "O valor"): T {
  if (value === null || value === undefined) {
    throw new Error(`${description} deveria existir neste ponto do cenário`)
  }

  return value
}

// Os tipos do bun:test declaram os matchers como síncronos, mas `rejects` devolve uma Promise de verdade.
export function rejects(operation: Promise<unknown>, message?: string | RegExp) {
  return Promise.resolve(expect(operation).rejects.toThrow(message))
}
