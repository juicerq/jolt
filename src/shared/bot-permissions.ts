export const botPermissionModes = ["read-only", "ask", "full"] as const

export type BotPermissionMode = (typeof botPermissionModes)[number]
