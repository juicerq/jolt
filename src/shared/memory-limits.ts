export const memoryLimits = { memory: 300, total: 4000, batch: 32, message: 12_000, results: 12 } as const

export function memoryUsage(memories: { content: string; supersededAt?: string | null }[]) {
  return memories.reduce((total, memory) => total + (memory.supersededAt ? 0 : memory.content.length), 0)
}
