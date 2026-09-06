import type { PermissionRequest } from "@src/shared/permissions"

const actions: Record<string, [string, string, string]> = {
  read: ["ler este arquivo", "Ler arquivo", "Não ler"],
  find: ["buscar arquivos nesta pasta", "Buscar arquivos", "Não buscar"],
  grep: ["pesquisar nesta pasta", "Pesquisar", "Não pesquisar"],
  ls: ["ver os arquivos desta pasta", "Ver arquivos", "Não abrir"],
  hire: ["adicionar este Integrante ao time", "Adicionar Integrante", "Não adicionar"],
  note: ["guardar esta informação na Memória", "Guardar", "Não guardar"],
  routine: ["salvar esta Rotina", "Salvar Rotina", "Não salvar"],
  remove_routine: ["remover esta Rotina", "Remover Rotina", "Não remover"],
  gmail_search: ["buscar no seu Gmail", "Buscar", "Não buscar"],
  gmail_read_thread: ["ler esta conversa no Gmail", "Ler conversa", "Não ler"],
  gmail_create_draft: ["salvar este rascunho no Gmail", "Salvar rascunho", "Não salvar"],
  gmail_send: ["enviar este email", "Enviar email", "Não enviar"],
  gmail_send_draft: ["enviar este rascunho do Gmail", "Enviar rascunho", "Não enviar"],
  gmail_reply: ["responder a esta conversa no Gmail", "Enviar resposta", "Não enviar"],
  gmail_archive: ["arquivar esta conversa no Gmail", "Arquivar", "Não arquivar"],
  gmail_mark_read: ["alterar a marcação de leitura desta conversa", "Alterar marcação", "Não alterar"],
  gmail_label: ["alterar os marcadores desta conversa", "Alterar marcadores", "Não alterar"],
  gmail_trash: ["mover esta conversa para a lixeira do Gmail", "Mover para a lixeira", "Não mover"],
  gmail_list_labels: ["consultar seus marcadores do Gmail", "Consultar", "Não consultar"],
  whatsapp_chats: ["consultar suas conversas no WhatsApp", "Consultar", "Não consultar"],
  whatsapp_read: ["ler esta conversa no WhatsApp", "Ler conversa", "Não ler"],
  whatsapp_send: ["enviar esta mensagem no WhatsApp", "Enviar mensagem", "Não enviar"],
  github_repositories: ["consultar seus repositórios no GitHub", "Consultar", "Não consultar"],
  github_issue_read: ["ler esta issue no GitHub", "Ler issue", "Não ler"],
  github_pull_request_read: ["ler este PR no GitHub", "Ler PR", "Não ler"],
  github_comment: ["publicar este comentário no GitHub", "Publicar comentário", "Não publicar"],
  github_pull_request_create: ["abrir este PR no GitHub", "Abrir PR", "Não abrir"],
}

function text(request: PermissionRequest, field: string) {
  const value = request.arguments?.[field]

  if (typeof value === "string" || typeof value === "number") {
    return String(value)
  }
}

function filePresentation(request: PermissionRequest) {
  const path = text(request, "path") ?? request.detail
  const name = path?.split(/[\\/]/).filter(Boolean).at(-1) ?? "este arquivo"

  if (request.tool === "write") {
    return { title: `Posso salvar ${name}?`, description: "Vou gravar o conteúdo solicitado. Se o arquivo já existir, seu conteúdo será substituído.", allow: "Salvar arquivo", deny: "Não salvar" }
  }

  const before = text(request, "oldText")
  const after = text(request, "newText")
  const short = before && after && before.length <= 100 && after.length <= 100 && !before.includes("\n") && !after.includes("\n")

  return {
    title: `Posso alterar ${name}?`,
    description: short ? `Vou substituir “${before}” por “${after}”.` : "Vou substituir o trecho indicado pelo novo conteúdo solicitado.",
    allow: "Alterar arquivo",
    deny: "Não alterar",
  }
}

function actionDescription(request: PermissionRequest) {
  const values = [
    text(request, "to") && `Para: ${text(request, "to")}`,
    text(request, "cc") && `Com cópia para: ${text(request, "cc")}`,
    text(request, "chatId") && `Conversa: ${text(request, "chatId")}`,
    text(request, "repository") && `Repositório: ${[text(request, "owner"), text(request, "repository")].filter(Boolean).join("/")}`,
    text(request, "number") && `Issue ou PR: #${text(request, "number")}`,
    text(request, "subject"),
    text(request, "title"),
    text(request, "body"),
    text(request, "message"),
    text(request, "text"),
    text(request, "content"),
    text(request, "query"),
    text(request, "name"),
    text(request, "outcome"),
    request.detail,
    request.brief,
  ].filter(Boolean)

  if (["read", "find", "grep", "ls"].includes(request.tool)) {
    return `O acesso é fora da pasta de trabalho do Bot${request.detail ? `: ${request.detail}` : "."}`
  }

  if (request.tool === "remove_routine") {
    return "A Rotina deixará de chamar o Bot. Não é possível desfazer."
  }

  return [...new Set(values)].join("\n")
}

export function permissionPresentation(request: PermissionRequest) {
  if (request.tool === "edit" || request.tool === "write") {
    return filePresentation(request)
  }

  if (request.tool === "bash") {
    return { title: "Posso executar este comando?", description: request.detail ?? "O efeito deste comando não foi informado.", allow: "Executar", deny: "Não executar" }
  }

  const action = actions[request.tool]

  if (action) {
    return { title: `Posso ${action[0]}?`, description: actionDescription(request), allow: action[1], deny: action[2] }
  }

  return { title: "Posso executar esta ação?", description: [request.label ?? request.tool, actionDescription(request)].filter(Boolean).join("\n"), allow: "Permitir", deny: "Não permitir" }
}
