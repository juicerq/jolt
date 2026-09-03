export const pluginKinds = ["gmail", "whatsapp", "mcp"] as const

export type PluginKind = (typeof pluginKinds)[number]

export const accountStates = ["connected", "needs-auth", "failed"] as const

export type AccountState = (typeof accountStates)[number]
