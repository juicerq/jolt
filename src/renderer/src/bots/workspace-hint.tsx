export function WorkspaceHint({ source, workingDirectoryOverride }: { source?: { name: string; directory: string | null }; workingDirectoryOverride: string }) {
  if (workingDirectoryOverride) {
    return <small className="text-support font-normal text-muted">A pasta própria substitui a pasta herdada.</small>
  }

  if (source?.directory) {
    return <small className="text-support font-normal text-muted">Herdada de {source.name}: <span className="font-mono [overflow-wrap:anywhere]">{source.directory}</span></small>
  }

  return <small className="text-support font-normal text-muted">Sem uma pasta própria ou padrão do Projeto, o Bot usa seu Diretório privado.</small>
}
