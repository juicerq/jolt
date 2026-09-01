export function WorkspaceHint({ source, workingDirectoryOverride }: { source?: { name: string; directory: string }; workingDirectoryOverride: string }) {
  if (workingDirectoryOverride) {
    return <small className="text-support font-medium text-muted">A pasta própria substitui a pasta herdada.</small>
  }

  if (source) {
    return <small className="text-support font-medium text-muted">Herdada de {source.name}: <span className="font-mono [overflow-wrap:anywhere]">{source.directory}</span></small>
  }

  return <small className="text-support font-medium text-muted">Sem vínculo, o Bot usa uma pasta privada do Jolt.</small>
}
