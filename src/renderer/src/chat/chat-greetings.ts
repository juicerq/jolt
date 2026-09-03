const greetings = [
  "Olá! O que vamos fazer agora?",
  "Oi! Por onde começamos?",
  "Estou por aqui. No que vamos trabalhar?",
  "Olá! O que você tem em mente?",
  "Oi! Como posso ajudar agora?",
  "Vamos começar. O que você precisa?",
  "Olá! Qual é o trabalho de hoje?",
  "Podemos começar. O que vamos fazer?",
  "Oi! Me conte no que você quer trabalhar.",
  "Tudo certo por aqui. Qual é o primeiro passo?",
  "Olá! O que você quer resolver primeiro?",
  "Oi! Vamos trabalhar em quê?",
]

export function chatGreeting(botId: string) {
  let hash = 0

  for (let index = 0; index < botId.length; index += 1) {
    hash = (hash * 31 + botId.charCodeAt(index)) >>> 0
  }

  return greetings[hash % greetings.length] ?? greetings[0]
}
