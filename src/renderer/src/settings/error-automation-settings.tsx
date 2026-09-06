import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState, type FormEvent } from "react"
import type { z } from "zod"
import type { errorAutomationSchemas, ErrorAutomationConfig, ErrorCase, ErrorDecision } from "@src/shared/error-automation"
import type { PluginAccount } from "@src/shared/plugins"
import type { EngineClient } from "../engine-client"
import { Button } from "../ui/button"
import { Field, fieldControlClassName } from "../ui/field"
import { Select } from "../ui/select"
import { SettingsSection, settingsPanelClassName } from "../ui/settings-section"
import { Switch } from "../ui/switch"

type ErrorAutomationStatus = z.infer<typeof errorAutomationSchemas.status>

const stateLabels: Record<ErrorCase["state"], string> = {
  queued: "Na fila", analyzing: "Em análise", review: "Aguardando revisão", confirmed: "Erro confirmado",
  expected: "Comportamento esperado", external: "Causa externa", inconclusive: "Inconclusivo",
  issue_open: "Issue aberta", fixing: "Em correção", fix_failed: "Correção interrompida", pr_open: "PR aberta",
  merged: "PR integrada", published: "Correção publicada", verified: "Correção verificada",
}
const classificationLabels = {
  product_bug: "Erro do produto", observability_bug: "Erro no registro de eventos", expected: "Comportamento esperado",
  external: "Causa externa", inconclusive: "Inconclusivo",
}
const disclosureClassName = "cursor-pointer rounded-lg text-control font-medium text-secondary hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"

export function ErrorAutomationSettings({ client }: { client: EngineClient }) {
  const queryClient = useQueryClient()
  const options = client.query.errorAutomation.status.queryOptions({ refetchInterval: 10_000 })
  const { data, error, isPending } = useQuery(options)
  const refresh = () => { void queryClient.invalidateQueries({ queryKey: options.queryKey }) }
  const { mutate: run, isPending: running, error: runError } = useMutation(client.query.errorAutomation.run.mutationOptions({ onSettled: refresh }))
  const failure = error ?? runError

  return (
    <SettingsSection title="Time de erros Dogama">
      <div className={`${settingsPanelClassName} flex min-w-0 flex-col gap-4`}>
        {isPending && <p className="m-0 text-support text-muted">Carregando o time de erros...</p>}
        {failure && <p role="alert" className="m-0 text-support text-status-error">{failure.message}</p>}
        {data && <>
          {!data.config && <div>
            <h4 className="m-0 text-section font-semibold text-primary">O time ainda não foi configurado</h4>
            <p className="m-0 mt-1 text-support text-secondary">Escolha o Bot Dogama e a origem dos erros para começar a receber casos.</p>
          </div>}
          {data.config && <ErrorAutomationSummary status={data} config={data.config} running={running} onRun={() => run({})} />}
          <details open={!data.config}>
            <summary className={disclosureClassName}>Configurar o time</summary>
            <ErrorAutomationForm client={client} config={data.config} sourceConnected={data.sourceConnected} verificationConnected={data.verificationConnected} onSaved={refresh} />
          </details>
          {data.config && <ErrorCaseBrowser client={client} status={data} onChanged={refresh} />}
        </>}
      </div>
    </SettingsSection>
  )
}

function ErrorAutomationSummary({ status, config, running, onRun }: { status: ErrorAutomationStatus; config: ErrorAutomationConfig; running: boolean; onRun: () => void }) {
  return (
    <div className="flex flex-col gap-2" aria-live="polite">
      <p className="m-0 text-control font-medium text-primary">{config.collect ? "Recebimento ligado" : "Recebimento pausado"} · {status.sourceConnected ? "Token salvo" : "Token ausente"}</p>
      <p className="m-0 text-support text-muted">Último recebimento: {status.lastReceivedAt ? new Date(status.lastReceivedAt).toLocaleString("pt-BR") : "nenhum caso recebido"}</p>
      <p className="m-0 text-support text-secondary tabular-nums">Turnos no dia UTC: {status.todayTurns} / {config.dailyTurnLimit ?? "limite não definido"}</p>
      <p className="m-0 text-support text-secondary tabular-nums">{status.todayTokens.toLocaleString("pt-BR")} tokens no dia UTC · {status.todayNominalCost.toLocaleString("pt-BR", { style: "currency", currency: "USD" })} de custo nominal informado pelo modelo</p>
      <p className="m-0 text-support text-muted">O custo nominal não representa a cobrança da sua assinatura.</p>
      <p className="m-0 text-support text-secondary">{config.analyze ? "Análises ligadas" : "Análises pausadas"} · {config.publish ? "Publicação ligada" : "Publicação pausada"} · {config.correct ? "Correções ligadas" : "Correções pausadas"}</p>
      {config.dailyTurnLimit !== null && status.todayTurns >= config.dailyTurnLimit && <p className="m-0 text-support text-status-warning">Limite diário atingido. Os próximos turnos aguardam a renovação do limite.</p>}
      {status.failure && <p role="alert" className="m-0 break-words text-support text-status-error">{status.failure}</p>}
      <Button type="button" variant="secondary" className="self-start" disabled={running} onClick={onRun}>{running ? "Atualizando..." : "Executar etapas ligadas agora"}</Button>
    </div>
  )
}

function ErrorCaseBrowser({ client, status, onChanged }: { client: EngineClient; status: ErrorAutomationStatus; onChanged: () => void }) {
  const [selectedId, setSelectedId] = useState("")
  const selected = status.cases.find((item) => item.id === selectedId) ?? status.cases[0]

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p className="m-0 text-support text-secondary tabular-nums">{status.counts.queued ?? 0} na fila · {status.counts.analyzing ?? 0} em análise · {status.counts.review ?? 0} em revisão · {status.counts.pr_open ?? 0} PRs abertas</p>
      {status.oldestQueuedAt && <p className="m-0 text-support text-muted">Caso mais antigo na fila: há {Math.max(0, Math.floor((Date.now() - new Date(status.oldestQueuedAt).getTime()) / 60_000)).toLocaleString("pt-BR")} min.</p>}
      <p className="m-0 text-support text-secondary">{Object.entries(classificationLabels).map(([key, label]) => `${label}: ${status.classifications[key] ?? 0}`).join(" · ")}</p>
      <p className="m-0 text-support text-muted">Bots temporários e cópias de análise são removidos após 30 dias. O histórico de decisões e execuções é preservado.</p>
      {status.cases.length === 0 && <p className="m-0 text-support text-secondary">Nenhum caso recebido. Os erros aparecerão aqui após a primeira coleta.</p>}
      {selected && <>
        <Field label="Caso">
          <Select value={selected.id} onChange={(event) => setSelectedId(event.target.value)}>
            {status.cases.map((item) => <option key={item.id} value={item.id}>{item.delivery.title} · {stateLabels[item.state]}</option>)}
          </Select>
        </Field>
        <ErrorCaseDetails key={`${selected.id}:${selected.revision}`} client={client} record={selected} verificationConnected={status.verificationConnected} onChanged={onChanged} />
      </>}
    </div>
  )
}

function ErrorAutomationForm({ client, config, sourceConnected, verificationConnected, onSaved }: { client: EngineClient; config: ErrorAutomationConfig | null; sourceConnected: boolean; verificationConnected: boolean; onSaved: () => void }) {
  const [draft, setDraft] = useState<Partial<ErrorAutomationConfig>>({})
  const [sourceToken, setSourceToken] = useState("")
  const [verificationToken, setVerificationToken] = useState("")
  const { data: groups, error: projectError } = useQuery(client.query.projects.list.queryOptions())
  const { data: plugins, error: pluginError } = useQuery(client.query.plugins.list.queryOptions())
  const { mutate: configure, isPending, error } = useMutation(client.query.errorAutomation.configure.mutationOptions({
    onSuccess() { setSourceToken(""); setVerificationToken(""); setDraft({}) },
    onSettled: onSaved,
  }))
  const values: ErrorAutomationConfig = {
    projectId: "", dogamaBotId: "", sourceUrl: "", repositoryDirectory: "", githubAccountId: null,
    collect: true, analyze: false, publish: false, correct: false, releaseCorrections: false, dailyTurnLimit: null,
    concurrency: 2, maxLunaAttempts: 2, analysisLeaderId: null, correctionLeaderId: null,
    ...config, ...draft,
  }
  const update = (patch: Partial<ErrorAutomationConfig>) => { setDraft({ ...draft, ...patch }) }
  const project = groups?.projects.find((item) => item.id === values.projectId)
  const bots = project?.bots.filter((bot) => !bot.closed && !bot.executionProfile) ?? []
  const accounts = plugins?.plugins.filter((plugin) => plugin.kind === "github").flatMap((plugin) => plugin.accounts) ?? []
  const failure = error ?? projectError ?? pluginError

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    configure({ ...values, ...(sourceToken ? { sourceToken } : {}), ...(verificationToken ? { verificationToken } : {}) })
  }

  return (
    <form className="mt-4 flex flex-col gap-4" onSubmit={handleSubmit}>
      <fieldset className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0 disabled:opacity-60" disabled={isPending}>
        <Field label="Projeto Dogama">
          <Select required value={values.projectId} onChange={(event) => {
            const nextProject = groups?.projects.find((item) => item.id === event.target.value)
            update({ projectId: event.target.value, dogamaBotId: "", repositoryDirectory: nextProject?.defaultWorkingDirectory ?? "" })
          }}>
            <option value="">Selecione um Projeto</option>
            {groups?.projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </Select>
        </Field>
        <Field label="Bot Dogama">
          <Select required value={values.dogamaBotId} onChange={(event) => update({ dogamaBotId: event.target.value })}>
            <option value="">Selecione o Bot responsável</option>
            {bots.map((bot) => <option key={bot.id} value={bot.id}>{bot.name}</option>)}
          </Select>
        </Field>
        {project && !bots.length && <p className="m-0 text-support text-secondary">Crie um Bot neste Projeto para acompanhar o time de erros.</p>}
        <Field label="Endereço da origem dos erros">
          <input type="url" required className={fieldControlClassName} placeholder="https://app.dogama.com.br" value={values.sourceUrl} onChange={(event) => update({ sourceUrl: event.target.value })} />
        </Field>
        <ErrorAutomationTokenFields collect={values.collect} sourceConnected={sourceConnected} verificationConnected={verificationConnected} sourceToken={sourceToken} verificationToken={verificationToken} onSourceToken={setSourceToken} onVerificationToken={setVerificationToken} />
        <Field label="Pasta do código Dogama">
          <input required className={fieldControlClassName} value={values.repositoryDirectory} onChange={(event) => update({ repositoryDirectory: event.target.value })} />
        </Field>
        <ErrorAutomationLimitFields values={values} accounts={accounts} onChange={update} />
        {([
          ["collect", "Receber erros"], ["analyze", "Analisar erros recebidos"],
          ["publish", "Publicar issues confirmadas"], ["correct", "Corrigir issues liberadas"],
          ["releaseCorrections", "Liberar novas issues para correção automaticamente"],
        ] as const).map(([key, label]) => <div key={key} className="flex items-center justify-between gap-4">
          <span className="text-control text-secondary">{label}</span>
          <Switch aria-label={label} checked={values[key]} onChange={(checked) => update({ [key]: checked })} />
        </div>)}
        <p className="m-0 text-support text-secondary">A liberação automática adiciona a etiqueta automation:fix às novas issues confirmadas.</p>
        <Button type="submit" className="self-start">{isPending ? "Salvando..." : "Salvar configuração do time"}</Button>
      </fieldset>
      {failure && <p role="alert" className="m-0 break-words text-support text-status-error">{failure.message}</p>}
    </form>
  )
}

function ErrorAutomationTokenFields({ collect, sourceConnected, verificationConnected, sourceToken, verificationToken, onSourceToken, onVerificationToken }: { collect: boolean; sourceConnected: boolean; verificationConnected: boolean; sourceToken: string; verificationToken: string; onSourceToken: (value: string) => void; onVerificationToken: (value: string) => void }) {
  return (
    <>
      <Field label={sourceConnected ? "Substituir token da origem" : "Token da origem"} optional={sourceConnected || !collect}>
        <input type="password" autoComplete="new-password" required={!sourceConnected && collect} minLength={16} className={fieldControlClassName} placeholder={sourceConnected ? "Deixe vazio para manter o token salvo" : "Cole o token de recebimento"} value={sourceToken} onChange={(event) => onSourceToken(event.target.value)} />
      </Field>
      <Field label="Token de verificação" optional>
        <input type="password" autoComplete="new-password" minLength={16} className={fieldControlClassName} placeholder={verificationConnected ? "Deixe vazio para manter o token salvo" : "Cole o token para confirmar correções"} value={verificationToken} onChange={(event) => onVerificationToken(event.target.value)} />
      </Field>
      {verificationConnected && <p className="m-0 text-support text-secondary">Token de verificação salvo.</p>}
    </>
  )
}

function ErrorAutomationLimitFields({ values, accounts, onChange }: { values: ErrorAutomationConfig; accounts: PluginAccount[]; onChange: (patch: Partial<ErrorAutomationConfig>) => void }) {
  return (
    <>
      <Field label="Conta GitHub" optional>
        <Select value={values.githubAccountId ?? ""} onChange={(event) => onChange({ githubAccountId: event.target.value || null })}>
          <option value="">Usar a conta do Bot Dogama</option>
          {accounts.map((account) => <option key={account.id} value={account.id} disabled={account.state !== "connected"}>{account.label}{account.state !== "connected" ? " · Reconectar" : ""}</option>)}
        </Select>
      </Field>
      <Field label="Limite de turnos por dia" optional={!values.analyze && !values.correct}>
        <input type="number" required={values.analyze || values.correct} min={1} max={10_000} step={1} className={fieldControlClassName} value={values.dailyTurnLimit ?? ""} onChange={(event) => onChange({ dailyTurnLimit: event.target.value ? Number(event.target.value) : null })} />
      </Field>
      <p className="m-0 text-support text-secondary">Defina o limite antes de ligar análises ou correções. Até {values.concurrency} casos trabalham ao mesmo tempo.</p>
    </>
  )
}

function ErrorCaseDetails({ client, record, verificationConnected, onChanged }: { client: EngineClient; record: ErrorCase; verificationConnected: boolean; onChanged: () => void }) {
  const report = record.report

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p className="m-0 break-words text-control font-medium text-primary">{stateLabels[record.state]}{report ? ` · ${classificationLabels[report.classification]}` : ""}</p>
      <p className="m-0 text-support text-muted">{record.delivery.count} ocorrências · {record.environment} · Revisão {record.revision}</p>
      {report && report.revision !== record.revision && <p className="m-0 text-support text-muted">O relatório analisou a revisão {report.revision}; a última ocorrência está na revisão {record.revision}.</p>}
      {record.failure && <p role="alert" className="m-0 break-words text-support text-status-error">{record.failure}</p>}
      <div className="flex flex-wrap gap-4 text-support">
        {record.issueUrl && <a href={record.issueUrl} target="_blank" rel="noreferrer" className="text-secondary underline underline-offset-3 hover:text-primary">Issue #{record.issueNumber}</a>}
        {record.prUrl && <a href={record.prUrl} target="_blank" rel="noreferrer" className="text-secondary underline underline-offset-3 hover:text-primary">PR #{record.prNumber}</a>}
      </div>
      <ErrorCaseReport record={record} />
      <ErrorCaseReview client={client} record={record} onChanged={onChanged} />
      {record.prNumber !== null && <ErrorVerification client={client} record={record} verificationConnected={verificationConnected} onChanged={onChanged} />}
    </div>
  )
}

function ErrorCaseReport({ record }: { record: ErrorCase }) {
  const report = record.report

  return (
    <details>
      <summary className={disclosureClassName}>Relatório e rascunho da issue</summary>
      <div className="mt-3 flex min-w-0 flex-col gap-3 text-support text-secondary">
        {!report && <p className="m-0">O relatório aparecerá após a análise.</p>}
        {report && <>
          <dl className="m-0 flex flex-col gap-3">
            {[["O que aconteceu", report.observed], ["O que deveria acontecer", report.expected], ["Referência do comportamento", report.expectedSource], ["Impacto", report.impact], ["Prova", report.proof.description]].map(([label, value]) => <div key={label}><dt className="font-medium text-primary">{label}</dt><dd className="m-0 mt-1 whitespace-pre-wrap break-words">{value}</dd></div>)}
          </dl>
          {report.evidence.map((evidence, index) => <div key={index}>
            <p className="m-0 break-all font-mono text-metadata text-primary">{evidence.path}:{evidence.line}</p>
            <pre className="my-1 whitespace-pre-wrap break-words font-mono text-support">{evidence.quote}</pre>
            <p className="m-0 break-words">{evidence.explanation}</p>
          </div>)}
          {report.gaps.length > 0 && <div><p className="m-0 font-medium text-primary">O que falta esclarecer</p><ul className="my-1 list-disc pl-4">{report.gaps.map((gap, index) => <li key={index} className="break-words">{gap}</li>)}</ul></div>}
        </>}
        <h4 className="m-0 text-control font-medium text-primary">Rascunho local da issue</h4>
        <pre className="m-0 whitespace-pre-wrap break-words font-mono text-support">{record.issueDraft ?? "Ainda não há rascunho."}</pre>
        {record.decision && <p className="m-0 break-words">Última decisão: {record.decision.reason}</p>}
      </div>
    </details>
  )
}

function ErrorCaseReview({ client, record, onChanged }: { client: EngineClient; record: ErrorCase; onChanged: () => void }) {
  const [reason, setReason] = useState("")
  const [verdict, setVerdict] = useState<ErrorDecision["verdict"]>("inconclusive")
  const { mutate: decide, isPending: deciding, error: decisionError } = useMutation(client.query.errorAutomation.decide.mutationOptions({ onSettled: onChanged }))
  const { mutate: reanalyze, isPending: reanalyzing, error: reanalysisError } = useMutation(client.query.errorAutomation.reanalyze.mutationOptions({ onSettled: onChanged }))
  const report = record.report
  const canDecide = record.state === "review" && !!report
  const locked = deciding || !canDecide
  const busy = deciding || reanalyzing
  const failure = decisionError ?? reanalysisError

  return (
    <>
      <details>
        <summary className={disclosureClassName}>Revisar este caso</summary>
        <form className="mt-3 flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); decide({ caseId: record.id, revision: report?.revision ?? record.revision, verdict, reason: reason.trim() }) }}>
          {!canDecide && <p className="m-0 text-support text-secondary">Uma decisão pode ser registrada quando o relatório estiver aguardando revisão.</p>}
          <Field label="Decisão">
            <Select value={verdict} disabled={locked} onChange={(event) => setVerdict(event.target.value as ErrorDecision["verdict"])}>
              <option value="inconclusive">Inconclusivo</option><option value="confirmed">Confirmar erro</option><option value="expected">Comportamento esperado</option><option value="external">Causa externa</option>
            </Select>
          </Field>
          <Field label="Motivo da decisão"><textarea required rows={3} className={fieldControlClassName} value={reason} disabled={locked} onChange={(event) => setReason(event.target.value)} /></Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="secondary" disabled={busy || locked || !reason.trim()}>{deciding ? "Registrando..." : "Registrar decisão"}</Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => reanalyze({ caseId: record.id })}>{reanalyzing ? "Reenfileirando..." : "Reanalisar caso"}</Button>
          </div>
        </form>
      </details>
      {failure && <p role="alert" className="m-0 break-words text-support text-status-error">{failure.message}</p>}
    </>
  )
}

function ErrorVerification({ client, record, verificationConnected, onChanged }: { client: EngineClient; record: ErrorCase; verificationConnected: boolean; onChanged: () => void }) {
  const { mutate: verify, isPending, error } = useMutation(client.query.errorAutomation.verify.mutationOptions({ onSettled: onChanged }))

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    verify({ caseId: record.id, publishedVersion: textField(fields, "version"), evidence: textField(fields, "evidence"), representativeTraffic: textField(fields, "traffic") })
  }

  return (
    <details>
      <summary className={disclosureClassName}>Verificar correção publicada</summary>
      <form className="mt-3 flex flex-col gap-3" onSubmit={handleSubmit}>
        <p className="m-0 text-support text-secondary">Registre a versão em produção e o resultado com tráfego representativo para verificar a correção.</p>
        {!verificationConnected && <p className="m-0 text-support text-secondary">Configure o token de verificação para confirmar na Dogama.</p>}
        {record.verification && <p className="m-0 break-words text-support text-secondary">{record.verification}</p>}
        <Field label="Commit publicado"><input name="version" required pattern="[a-f0-9]{40}" title="Informe o identificador completo do commit, com 40 caracteres." defaultValue={record.publishedVersion ?? ""} className={fieldControlClassName} /></Field>
        <Field label="Evidência da correção"><textarea name="evidence" required rows={3} className={fieldControlClassName} /></Field>
        <Field label="Tráfego observado"><textarea name="traffic" required rows={2} className={fieldControlClassName} /></Field>
        <Button type="submit" variant="secondary" className="self-start" disabled={isPending || !verificationConnected}>{isPending ? "Verificando..." : "Registrar verificação"}</Button>
        {error && <p role="alert" className="m-0 break-words text-support text-status-error">{error.message}</p>}
      </form>
    </details>
  )
}

function textField(fields: FormData, name: string) {
  const value = fields.get(name)
  if (typeof value !== "string") {
    return ""
  }

  return value
}
