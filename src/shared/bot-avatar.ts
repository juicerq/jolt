export function defaultBotAvatarSeed(name: string) {
  return `mimo:new:${name}`
}

export function randomBotAvatarSeed() {
  return defaultBotAvatarSeed(crypto.randomUUID())
}
