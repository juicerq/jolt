export const memoryLimits = { memory: 300, total: 4000, note: 500, batch: 32 } as const

export function memoryUsage(memories: { content: string }[]) {
  return memories.reduce((total, memory) => total + memory.content.length, 0)
}
