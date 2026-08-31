export type BotStatus = "idle" | "working" | "waiting" | "done" | "error"

export type PrototypeBot = {
  id: string
  name: string
  role: "leader" | "member"
  provider: "Codex" | "Claude Code"
  outcome: string
  status: BotStatus
  workingPath?: string
  temporary?: boolean
}

export type PrototypeSession = {
  bot: PrototypeBot
  members: PrototypeBot[]
}

export type PrototypeMessage = {
  id: string
  author: string
  role: "person" | "bot"
  content: string
  time: string
  status?: "streaming" | "interrupted"
  activity?: string[]
  delegation?: { botId: string; bot: string; task: string; status: "working" | "done" }
  decision?: { question: string; options: string[] }
  error?: string
}

export const salesBots: PrototypeBot[] = [
  { id: "leader", name: "Marina", role: "leader", provider: "Claude Code", outcome: "Transformar oportunidades em contratos prontos", status: "idle", workingPath: "/home/jui/dogama/vendas" },
  { id: "prospecting", name: "Caio", role: "member", provider: "Codex", outcome: "Encontrar e qualificar novas oportunidades", status: "error", workingPath: "/home/jui/dogama/vendas" },
  { id: "proposals", name: "Lia", role: "member", provider: "Claude Code", outcome: "Entregar propostas claras e prontas para revisão", status: "done", workingPath: "/home/jui/dogama/vendas" },
  { id: "follow-up", name: "Nina", role: "member", provider: "Codex", outcome: "Manter cada negociação avançando", status: "waiting", workingPath: "/home/jui/dogama/vendas" },
  { id: "account-research", name: "Ravi", role: "member", provider: "Claude Code", outcome: "Pesquisar a conta Acme para esta negociação", status: "working", workingPath: "/home/jui/dogama/vendas", temporary: true },
]

export const prototypeSessions: PrototypeSession[] = [
  { bot: salesBots[0], members: salesBots.slice(1) },
  {
    bot: { id: "product-leader", name: "Bia", role: "leader", provider: "Codex", outcome: "Transformar sinais dos clientes em decisões de produto", status: "idle", workingPath: "/home/jui/projects/dogama/app" },
    members: [
      { id: "product-research", name: "Ivo", role: "member", provider: "Claude Code", outcome: "Organizar pesquisas e validar problemas", status: "working", workingPath: "/home/jui/projects/dogama/app" },
      { id: "product-specs", name: "Maya", role: "member", provider: "Codex", outcome: "Escrever escopos claros para implementação", status: "waiting", workingPath: "/home/jui/projects/dogama/app" },
    ],
  },
  {
    bot: { id: "support-leader", name: "Dora", role: "leader", provider: "Claude Code", outcome: "Resolver pedidos dos clientes com rapidez e contexto", status: "idle" },
    members: [
      { id: "support-triage", name: "Theo", role: "member", provider: "Codex", outcome: "Classificar pedidos e encontrar bloqueios", status: "done" },
      { id: "support-docs", name: "Cris", role: "member", provider: "Claude Code", outcome: "Manter respostas e instruções atualizadas", status: "idle" },
    ],
  },
  {
    bot: { id: "marketing-leader", name: "Olívia", role: "leader", provider: "Codex", outcome: "Planejar campanhas ligadas às metas do negócio", status: "idle" },
    members: [
      { id: "marketing-content", name: "Gil", role: "member", provider: "Claude Code", outcome: "Criar conteúdo para cada campanha", status: "working" },
    ],
  },
  { bot: { id: "finance", name: "Tom", role: "member", provider: "Codex", outcome: "Organizar despesas e preparar resumos financeiros", status: "idle" }, members: [] },
  { bot: { id: "writing", name: "Eva", role: "member", provider: "Claude Code", outcome: "Revisar textos e preservar meu jeito de escrever", status: "done" }, members: [] },
]

export const initialMessages: Record<string, PrototypeMessage[]> = {
  leader: [
    { id: "l1", author: "Você", role: "person", content: "Quais oportunidades merecem atenção hoje?", time: "09:42" },
    { id: "l2", author: "Marina", role: "bot", content: "Temos três oportunidades abertas. A Acme pediu uma revisão de escopo, a Nuvem aguarda proposta e a Orbital não responde há cinco dias.", time: "09:42", activity: ["Consultou o histórico do time", "Reuniu o estado de 3 negociações"] },
    { id: "l3", author: "Você", role: "person", content: "Priorize a Acme e peça para a Lia preparar a revisão.", time: "09:44" },
    { id: "l4", author: "Marina", role: "bot", content: "Dividi o trabalho. Lia está revisando a proposta e criei Ravi temporariamente para pesquisar a conta.", time: "09:44", delegation: { botId: "proposals", bot: "Lia", task: "Revisar a proposta da Acme", status: "done" } },
    { id: "l5", author: "Marina", role: "bot", content: "Ravi vai sair do time quando a pesquisa terminar.", time: "09:45", delegation: { botId: "account-research", bot: "Ravi · Temporário", task: "Pesquisar mudanças recentes na conta Acme", status: "working" } },
  ],
  prospecting: [
    { id: "c1", author: "Marina · Líder", role: "bot", content: "Encontre cinco empresas parecidas com a Acme.", time: "09:40" },
    { id: "c2", author: "Caio", role: "bot", content: "Não consegui iniciar a pesquisa.", time: "09:41", error: "A sessão do Codex terminou. Entre novamente para continuar." },
  ],
  proposals: [
    { id: "p1", author: "Marina · Líder", role: "bot", content: "Revise a proposta da Acme com o novo escopo e mantenha o valor aprovado.", time: "09:45" },
    { id: "p2", author: "Lia", role: "bot", content: "Revisão concluída. Atualizei as entregas sem alterar o preço e enviei o resultado para Marina.", time: "09:52", activity: ["Leu a proposta atual", "Comparou 4 mudanças de escopo", "Entregou a revisão para Marina"] },
  ],
  "follow-up": [
    { id: "f1", author: "Marina · Líder", role: "bot", content: "Prepare uma retomada curta para a Orbital.", time: "Ontem" },
    { id: "f2", author: "Nina", role: "bot", content: "A mensagem está pronta. Preciso da sua aprovação antes de enviar.", time: "09:48", decision: { question: "Enviar a retomada para a Orbital?", options: ["Aprovar e enviar", "Pedir alteração"] } },
  ],
  "account-research": [
    { id: "r1", author: "Marina · Líder", role: "bot", content: "Pesquise mudanças recentes na conta Acme e traga somente fatos com fontes.", time: "09:45" },
    { id: "r2", author: "Ravi", role: "bot", content: "Estou reunindo as mudanças de liderança e os anúncios dos últimos 90 dias.", time: "Agora", status: "streaming", activity: ["Pesquisando a conta Acme", "Verificando fontes"] },
  ],
}

export const fakeReply = "Vou organizar isso em uma entrega curta: primeiro confirmo o contexto, depois preparo o material e marco o que precisa da sua decisão."

export const statusLabels: Record<BotStatus, string> = {
  idle: "Disponível",
  working: "Trabalhando",
  waiting: "Aguardando você",
  done: "Concluído",
  error: "Precisa de atenção",
}
