import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import type { DiagnosticsReport } from "../../shared/observability/diagnostics"
import type { ProviderAvailability } from "../../shared/providers"
import type { EngineClient } from "./engine-client"
import { BotsWorkspace } from "./bots/bots-workspace"

export function App({ client }: { client: EngineClient }) {
  return (
    <main>
      <header>
        <p className="eyebrow">Jots local</p>
        <h1>Seus Bots</h1>
        <p className="subtitle">Crie um Bot, escolha o executor e defina sua Função.</p>
      </header>
      <BotsWorkspace client={client} />
      <header className="technical-heading">
        <p className="eyebrow">Estado local</p>
        <h2>Diagnóstico técnico</h2>
        <p className="subtitle">Falhas e durações medidas pelo Bun Engine nesta sessão.</p>
      </header>
      <EngineHealth client={client} />
      <ProvidersPanel client={client} />
      <DiagnosticsPanel client={client} />
    </main>
  )
}

function EngineHealth({ client }: { client: EngineClient }) {
  const { data, error } = useQuery(client.health.queryOptions())

  if (error) {
    return <section className="status-card error">Falha ao conectar ao Bun Engine: {error.message}</section>
  }

  return (
    <section className="status-card">
      <span aria-hidden="true" className={data ? "status-dot ready" : "status-dot"} />
      {data ? `Bun Engine conectado: ${data.runtime}` : "Verificando Bun Engine..."}
    </section>
  )
}

const providerStatusLabels: Record<ProviderAvailability["status"], string> = {
  available: "Disponível",
  unauthenticated: "Desautenticado",
  missing: "Ausente",
  incompatible: "Incompatível",
}

function ProvidersPanel({ client }: { client: EngineClient }) {
  const { data, error, isPending, refetch, isFetching } = useQuery(client.providers.list.queryOptions())

  return (
    <section className="panel providers-panel">
      <div className="panel-heading">
        <div><h2>Fornecedores</h2><p className="empty">Sessões locais do Codex e Claude Code.</p></div>
        <button type="button" disabled={isFetching} onClick={() => refetch()}>{isFetching ? "Verificando..." : "Verificar novamente"}</button>
      </div>
      {error && <p className="error">Falha ao verificar fornecedores: {error.message}</p>}
      {isPending ? <p className="empty">Verificando instalações...</p> : (
        <ul className="provider-list">{data?.map((provider) => (
          <li key={provider.provider}>
            <strong>{provider.provider === "codex" ? "Codex" : "Claude Code"}</strong>
            <span className={`provider-status ${provider.status}`}>{providerStatusLabels[provider.status]}{provider.version ? ` · ${provider.version}` : ""}</span>
          </li>
        ))}</ul>
      )}
    </section>
  )
}

function DiagnosticsPanel({ client }: { client: EngineClient }) {
  const { data, error } = useQuery(client.diagnostics.get.queryOptions({ refetchInterval: 2_000 }))

  if (error) {
    return <section className="panel error">Falha ao carregar diagnóstico: {error.message}</section>
  }

  if (!data) {
    return <section className="panel">Carregando medições...</section>
  }

  return (
    <section className="diagnostics-grid">
      <ProcessPanel diagnostics={data} />
      <OperationsPanel operations={data.operations} />
      <SlowOperationsPanel operations={data.slowOperations} />
      <FailuresPanel failures={data.failures} />
      <ExportPanel client={client} logPath={data.logPath} />
    </section>
  )
}

function ProcessPanel({ diagnostics }: { diagnostics: DiagnosticsReport }) {
  return (
    <article className="panel">
      <h2>Processos</h2>
      <dl>
        <div><dt>Electron Main</dt><dd>{diagnostics.processes.main}</dd></div>
        <div><dt>Bun Engine</dt><dd>{diagnostics.processes.engine}</dd></div>
        <div><dt>Aplicativo</dt><dd>{diagnostics.versions.app}</dd></div>
        <div><dt>Electron</dt><dd>{diagnostics.versions.electron}</dd></div>
        <div><dt>Bun</dt><dd>{diagnostics.versions.bun}</dd></div>
        <div><dt>Codex</dt><dd>{diagnostics.authentication.codex}</dd></div>
        <div><dt>Claude</dt><dd>{diagnostics.authentication.claude}</dd></div>
      </dl>
    </article>
  )
}

function SlowOperationsPanel({ operations }: { operations: DiagnosticsReport["slowOperations"] }) {
  return (
    <article className="panel wide">
      <h2>Operações mais lentas</h2>
      {operations.length === 0 ? <p className="empty">Nenhuma operação concluída.</p> : (
        <ul>{operations.map((operation) => (
          <li key={`${operation.name}-${operation.timestamp}`}><strong>{operation.name}</strong><span>{formatDuration(operation.durationMs)}</span></li>
        ))}</ul>
      )}
    </article>
  )
}

function OperationsPanel({ operations }: { operations: { name: string; count: number; p50Ms: number; p95Ms: number; maximumMs: number }[] }) {
  return (
    <article className="panel wide">
      <h2>Operações</h2>
      {operations.length === 0 ? <p className="empty">Nenhum Span concluído.</p> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Operação</th><th>Qtd.</th><th>p50</th><th>p95</th><th>Máximo</th></tr></thead>
            <tbody>{operations.map((operation) => (
              <tr key={operation.name}>
                <td>{operation.name}</td><td>{operation.count}</td><td>{formatDuration(operation.p50Ms)}</td>
                <td>{formatDuration(operation.p95Ms)}</td><td>{formatDuration(operation.maximumMs)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </article>
  )
}

function FailuresPanel({ failures }: { failures: { name: string; timestamp: string; error?: { message: string } }[] }) {
  return (
    <article className="panel wide">
      <h2>Últimas falhas</h2>
      {failures.length === 0 ? <p className="empty">Nenhuma falha registrada nesta sessão.</p> : (
        <ul>{failures.map((failure) => (
          <li key={`${failure.name}-${failure.timestamp}`}><strong>{failure.name}</strong><span>{failure.error?.message ?? "Falha sem mensagem"}</span></li>
        ))}</ul>
      )}
    </article>
  )
}

function ExportPanel({ client, logPath }: { client: EngineClient; logPath: string }) {
  const queryClient = useQueryClient()
  const [exportPath, setExportPath] = useState<string>()
  const { mutate, isPending, error } = useMutation(client.diagnostics.export.mutationOptions({
    onSuccess(result) {
      setExportPath(result.path)
      queryClient.invalidateQueries({ queryKey: client.diagnostics.get.queryOptions().queryKey })
    },
  }))

  return (
    <article className="panel wide export-panel">
      <div><h2>Arquivos locais</h2><p className="path">Logs: {logPath}</p>{exportPath && <p className="path">Exportado: {exportPath}</p>}</div>
      <button type="button" disabled={isPending} onClick={() => mutate({})}>{isPending ? "Exportando..." : "Exportar diagnóstico"}</button>
      {error && <p className="error">Falha ao exportar: {error.message}</p>}
    </article>
  )
}

function formatDuration(milliseconds: number) {
  return `${milliseconds.toFixed(1)} ms`
}
