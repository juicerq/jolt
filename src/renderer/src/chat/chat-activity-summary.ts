import type { ConversationActivity } from "../../../shared/conversations"

type ActivityStep = ConversationActivity["steps"][number]
type ActivityToolStep = Extract<ActivityStep, { type: "tool" }>
type ActivityTool = Omit<ActivityToolStep["tools"][number], "status"> & {
  status: "running" | "done" | "failed"
}

type ActivitySummaryStep =
  | Extract<ActivityStep, { type: "thinking" }>
  | (Omit<ActivityToolStep, "tools"> & { tools: ActivityTool[] })

type ActivitySummaryInput = {
  steps: ActivitySummaryStep[]
}

type ToolGroup = {
  name: string
  countTargets?: boolean
  namesTargets?: boolean
  active: (count: number, targets: string) => string
  done: (count: number, targets: string) => string
  failed: (count: number, targets: string) => string
  running: (count: number, targets: string) => string
}

const toolGroups: ToolGroup[] = [
  {
    name: "read",
    countTargets: true,
    active: (count) => count === 1 ? "lendo arquivo" : `lendo ${count} arquivos`,
    done: (count) => `leu ${formatCount(count, "arquivo", "arquivos")}`,
    failed: (count) => `falhou ao ler ${formatCount(count, "arquivo", "arquivos")}`,
    running: (count) => `deixou ${formatCount(count, "leitura", "leituras")} sem concluir`,
  },
  {
    name: "grep",
    active: (count) => count === 1 ? "buscando no código" : `fazendo ${count} buscas no código`,
    done: (count) => count === 1 ? "buscou no código" : `fez ${count} buscas no código`,
    failed: (count) => count === 1 ? "falhou ao buscar no código" : `falhou em ${count} buscas no código`,
    running: (count) => `deixou ${formatCount(count, "busca no código", "buscas no código")} sem concluir`,
  },
  {
    name: "find",
    active: (count) => count === 1 ? "procurando arquivos" : `fazendo ${count} buscas por arquivos`,
    done: (count) => count === 1 ? "procurou arquivos" : `fez ${count} buscas por arquivos`,
    failed: (count) => count === 1 ? "falhou ao procurar arquivos" : `falhou em ${count} buscas por arquivos`,
    running: (count) => `deixou ${formatCount(count, "busca por arquivos", "buscas por arquivos")} sem concluir`,
  },
  {
    name: "ls",
    countTargets: true,
    active: (count) => count === 1 ? "listando pasta" : `listando ${count} pastas`,
    done: (count) => `listou ${formatCount(count, "pasta", "pastas")}`,
    failed: (count) => `falhou ao listar ${formatCount(count, "pasta", "pastas")}`,
    running: (count) => `deixou ${formatCount(count, "listagem", "listagens")} sem concluir`,
  },
  {
    name: "edit",
    countTargets: true,
    active: (count) => count === 1 ? "editando arquivo" : `editando ${count} arquivos`,
    done: (count) => `editou ${formatCount(count, "arquivo", "arquivos")}`,
    failed: (count) => `falhou ao editar ${formatCount(count, "arquivo", "arquivos")}`,
    running: (count) => `deixou ${formatCount(count, "edição", "edições")} sem concluir`,
  },
  {
    name: "write",
    countTargets: true,
    active: (count) => count === 1 ? "criando arquivo" : `criando ${count} arquivos`,
    done: (count) => `criou ${formatCount(count, "arquivo", "arquivos")}`,
    failed: (count) => `falhou ao criar ${formatCount(count, "arquivo", "arquivos")}`,
    running: (count) => `deixou ${formatCount(count, "gravação", "gravações")} sem concluir`,
  },
  {
    name: "bash",
    active: (count) => count === 1 ? "executando comando" : `executando ${count} comandos`,
    done: (count) => `executou ${formatCount(count, "comando", "comandos")}`,
    failed: (count) => `${formatCount(count, "comando falhou", "comandos falharam")}`,
    running: (count) => `deixou ${formatCount(count, "comando", "comandos")} sem concluir`,
  },
  {
    name: "delegate",
    countTargets: true,
    namesTargets: true,
    active: (_count, targets) => `aguardando ${targets}`,
    done: (_count, targets) => `delegou para ${targets}`,
    failed: (count, targets) => `${count === 1 ? "delegação" : "delegações"} para ${targets} ${count === 1 ? "falhou" : "falharam"}`,
    running: (_count, targets) => `deixou ${targets} sem resposta`,
  },
  {
    name: "hire",
    countTargets: true,
    namesTargets: true,
    active: (_count, targets) => `aguardando ${targets}`,
    done: (_count, targets) => `contratou ${targets}`,
    failed: (count, targets) => `${count === 1 ? "contratação" : "contratações"} de ${targets} ${count === 1 ? "falhou" : "falharam"}`,
    running: (_count, targets) => `deixou ${targets} sem resposta`,
  },
  {
    name: "transfer",
    countTargets: true,
    namesTargets: true,
    active: (_count, targets) => `transferindo para ${targets}`,
    done: (_count, targets) => `transferiu para ${targets}`,
    failed: (count, targets) => `${count === 1 ? "transferência" : "transferências"} para ${targets} ${count === 1 ? "falhou" : "falharam"}`,
    running: (_count, targets) => `deixou a transferência para ${targets} sem concluir`,
  },
]

export function formatChatActivitySummary(activity: ActivitySummaryInput) {
  const clauses: string[] = []
  const thinkingSteps = activity.steps.filter((step) => step.type === "thinking")
  const thinkingDurationMs = thinkingSteps.reduce((total, step) => total + (step.durationMs ?? 0), 0)
  const hadThinking = thinkingSteps.some((step) => !!step.content.trim() || !!step.durationMs)
  const tools = activity.steps.flatMap((step) => step.type === "tool" ? step.tools : [])

  if (hadThinking) {
    clauses.push(thinkingDurationMs > 0
      ? `pensou por ${formatThinkingDuration(thinkingDurationMs)}`
      : "pensou")
  }

  for (const group of toolGroups) {
    clauses.push(...formatToolGroup(tools, group))
  }

  const knownNames = new Set(toolGroups.map((group) => group.name))
  const unknownNames = [...new Set(tools.filter((tool) => !knownNames.has(tool.name)).map((tool) => tool.name))]

  for (const name of unknownNames) {
    clauses.push(...formatUnknownTool(tools, name))
  }

  if (clauses.length === 0) {
    return "Atividade concluída"
  }

  const sentence = joinClauses(clauses)

  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}`
}

export function formatChatActivityStepLabel(step: ActivitySummaryStep) {
  if (step.type === "thinking") {
    return step.durationMs ? `Pensou por ${formatThinkingDuration(step.durationMs)}` : "Pensou"
  }

  const group = toolGroups.find((candidate) => candidate.name === step.name)

  if (!group) {
    return capitalize(joinClauses(formatUnknownTool(step.tools, step.name)))
  }

  const clauses = formatToolGroup(step.tools, group)

  return capitalize(joinClauses(clauses))
}

export function formatRunningChatActivityStepLabel(step: ActivitySummaryStep) {
  if (step.type === "thinking") {
    return "Pensando"
  }

  const group = toolGroups.find((candidate) => candidate.name === step.name)

  if (!group) {
    return `Usando ${step.name}`
  }

  const count = group.countTargets ? countTargets(step.tools) : step.tools.length

  return capitalize(group.active(count, formatTargets(step.tools)))
}

export function splitChatActivitySteps<Step extends ActivitySummaryStep>(steps: Step[]): Step[] {
  return steps.flatMap((step) => {
    if (step.type !== "tool") {
      return [step]
    }

    const group = toolGroups.find((candidate) => candidate.name === step.name)

    if (!group?.namesTargets) {
      return [step]
    }

    return step.tools.map((tool) => ({ ...step, tools: [tool] }))
  })
}

export function getChatActivityStepDetails(step: Extract<ActivitySummaryStep, { type: "tool" }>) {
  const group = toolGroups.find((candidate) => candidate.name === step.name)

  if (group?.namesTargets) {
    return { prose: true, items: [...new Set(step.tools.flatMap((tool) => tool.brief ? [tool.brief] : []))] }
  }

  return { prose: false, items: [...new Set(step.tools.flatMap((tool) => tool.detail ? [tool.detail] : []))] }
}

function formatToolGroup(tools: ActivityTool[], group: ToolGroup) {
  const matchingTools = tools.filter((tool) => tool.name === group.name)
  const clauses: string[] = []

  for (const status of ["done", "failed", "running"] as const) {
    const toolsWithStatus = matchingTools.filter((tool) => tool.status === status)

    if (toolsWithStatus.length === 0) {
      continue
    }

    const count = group.countTargets ? countTargets(toolsWithStatus) : toolsWithStatus.length
    clauses.push(group[status](count, formatTargets(toolsWithStatus)))
  }

  return clauses
}

function formatUnknownTool(tools: ActivityTool[], name: string) {
  const matchingTools = tools.filter((tool) => tool.name === name)
  const clauses: string[] = []
  const doneCount = matchingTools.filter((tool) => tool.status === "done").length
  const failedCount = matchingTools.filter((tool) => tool.status === "failed").length
  const runningCount = matchingTools.filter((tool) => tool.status === "running").length

  if (doneCount > 0) {
    clauses.push(doneCount === 1 ? `usou ${name}` : `usou ${name} ${doneCount} vezes`)
  }

  if (failedCount > 0) {
    clauses.push(failedCount === 1 ? `${name} falhou` : `${name} falhou ${failedCount} vezes`)
  }

  if (runningCount > 0) {
    clauses.push(runningCount === 1 ? `${name} ficou sem concluir` : `${runningCount} usos de ${name} ficaram sem concluir`)
  }

  return clauses
}

function countTargets(tools: ActivityTool[]) {
  const targets = new Set(tools.flatMap((tool) => tool.detail ? [tool.detail] : []))
  const toolsWithoutTarget = tools.filter((tool) => !tool.detail).length

  return targets.size + toolsWithoutTarget
}

function formatTargets(tools: ActivityTool[]) {
  const targets = [...new Set(tools.flatMap((tool) => tool.detail ? [tool.detail] : []))]

  return targets.length > 0 ? joinClauses(targets) : "um Integrante"
}

function formatCount(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`
}

function joinClauses(clauses: string[]) {
  if (clauses.length === 1) {
    return clauses[0]
  }

  return `${clauses.slice(0, -1).join(", ")} e ${clauses.at(-1)}`
}

function formatThinkingDuration(durationMs: number) {
  if (durationMs < 1_000) {
    return "menos de 1s"
  }

  const totalSeconds = Math.round(durationMs / 1_000)

  if (totalSeconds < 60) {
    return `${totalSeconds}s`
  }

  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return seconds === 0 ? `${minutes}min` : `${minutes}min ${seconds}s`
}

function capitalize(value: string) {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : "Atividade"
}
