export function defaultBotAvatarSeed(name: string) {
  return `jolt:new:${name}`
}

export function randomBotAvatarSeed() {
  return defaultBotAvatarSeed(crypto.randomUUID())
}
