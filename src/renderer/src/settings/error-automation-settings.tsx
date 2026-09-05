import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState, type FormEvent } from "react"
import type { ErrorAutomationConfig, ErrorCase, ErrorDecision } from "@src/shared/error-automation"
import type { EngineClient } from "../engine-client"
import { Button } from "../ui/button"
import { Field, fieldControlClassName } from "../ui/field"
import { Select } from "../ui/select"
import { SettingsSection, settingsPanelClassName } from "../ui/settings-section"
import { Switch } from "../ui/switch"

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
  const [selectedId, setSelectedId] = useState("")
  const refresh = () => { void queryClient.invalidateQueries({ queryKey: options.queryKey }) }
  const { mutate: run, isPending: running, error: runError } = useMutation(client.query.errorAutomation.run.mutationOptions({ onSettled: refresh }))
  const selected = data?.cases.find((item) => item.id === selectedId) ?? data?.cases[0]
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
          {data.config && <div className="flex flex-col gap-2" aria-live="polite">
            <p className="m-0 text-control font-medium text-primary">{data.config.collect ? "Recebimento ligado" : "Recebimento pausado"} · {data.sourceConnected ? "Token salvo" : "Token ausente"}</p>
            <p className="m-0 text-support text-muted">Último recebimento: {data.lastReceivedAt ? new Date(data.lastReceivedAt).toLocaleString("pt-BR") : "nenhum caso recebido"}</p>
            <p className="m-0 text-support text-secondary tabular-nums">Turnos no dia UTC: {data.todayTurns} / {data.config.dailyTurnLimit ?? "limite não definido"}</p>
            <p className="m-0 text-support text-secondary tabular-nums">{data.todayTokens.toLocaleString("pt-BR")} tokens no dia UTC · {data.todayNominalCost.toLocaleString("pt-BR", { style: "currency", currency: "USD" })} de custo nominal informado pelo modelo</p>
            <p className="m-0 text-support text-muted">O custo nominal não representa a cobrança da sua assinatura.</p>
            <p className="m-0 text-support text-secondary">{data.config.analyze ? "Análises ligadas" : "Análises pausadas"} · {data.config.publish ? "Publicação ligada" : "Publicação pausada"} · {data.config.correct ? "Correções ligadas" : "Correções pausadas"}</p>
            {data.config.dailyTurnLimit !== null && data.todayTurns >= data.config.dailyTurnLimit && <p className="m-0 text-support text-status-warning">Limite diário atingido. Os próximos turnos aguardam a renovação do limite.</p>}
            {data.failure && <p role="alert" className="m-0 break-words text-support text-status-error">{data.failure}</p>}
            <Button type="button" variant="secondary" className="self-start" disabled={running} onClick={() => run({})}>{running ? "Atualizando..." : "Executar etapas ligadas agora"}</Button>
          </div>}
          <details open={!data.config}>
            <summary className={disclosureClassName}>Configurar o time</summary>
            <ErrorAutomationForm client={client} config={data.config} sourceConnected={data.sourceConnected} verificationConnected={data.verificationConnected} onSaved={refresh} />
          </details>
          {data.config && <div className="flex min-w-0 flex-col gap-3">
            <p className="m-0 text-support text-secondary tabular-nums">{data.counts.queued ?? 0} na fila · {data.counts.analyzing ?? 0} em análise · {data.counts.review ?? 0} em revisão · {data.counts.pr_open ?? 0} PRs abertas</p>
            {data.oldestQueuedAt && <p className="m-0 text-support text-muted">Caso mais antigo na fila: há {Math.max(0, Math.floor((Date.now() - new Date(data.oldestQueuedAt).getTime()) / 60_000)).toLocaleString("pt-BR")} min.</p>}
            <p className="m-0 text-support text-secondary">{Object.entries(classificationLabels).map(([key, label]) => `${label}: ${data.classifications[key] ?? 0}`).join(" · ")}</p>
            <p className="m-0 text-support text-muted">Bots temporários e cópias de análise são removidos após 30 dias. O histórico de decisões e execuções é preservado.</p>
            {data.cases.length === 0 && <p className="m-0 text-support text-secondary">Nenhum caso recebido. Os erros aparecerão aqui após a primeira coleta.</p>}
            {selected && <>
              <Field label="Caso">
                <Select value={selected.id} onChange={(event) => setSelectedId(event.target.value)}>
                  {data.cases.map((item) => <option key={item.id} value={item.id}>{item.delivery.title} · {stateLabels[item.state]}</option>)}
                </Select>
              </Field>
              <ErrorCaseDetails key={`${selected.id}:${selected.revision}`} client={client} record={selected} verificationConnected={data.verificationConnected} onChanged={refresh} />
            </>}
          </div>}
        </>}
      </div>
    </SettingsSection>
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
            setDraft({ ...draft, projectId: event.target.value, dogamaBotId: "", repositoryDirectory: nextProject?.defaultWorkingDirectory ?? "" })
          }}>
            <option value="">Selecione um Projeto</option>
            {groups?.projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </Select>
        </Field>
        <Field label="Bot Dogama">
          <Select required value={values.dogamaBotId} onChange={(event) => setDraft({ ...draft, dogamaBotId: event.target.value })}>
            <option value="">Selecione o Bot responsável</option>
            {bots.map((bot) => <option key={bot.id} value={bot.id}>{bot.name}</option>)}
          </Select>
        </Field>
        {project && !bots.length && <p className="m-0 text-support text-secondary">Crie um Bot neste Projeto para acompanhar o time de erros.</p>}
        <Field label="Endereço da origem dos erros">
          <input type="url" required className={fieldControlClassName} placeholder="https://app.dogama.com.br" value={values.sourceUrl} onChange={(event) => setDraft({ ...draft, sourceUrl: event.target.value })} />
        </Field>
        <Field label={sourceConnected ? "Substituir token da origem" : "Token da origem"} optional={sourceConnected || !values.collect}>
          <input type="password" autoComplete="new-password" required={!sourceConnected && values.collect} minLength={16} className={fieldControlClassName} placeholder={sourceConnected ? "Deixe vazio para manter o token salvo" : "Cole o token de recebimento"} value={sourceToken} onChange={(event) => setSourceToken(event.target.value)} />
        </Field>
        <Field label="Token de verificação" optional>
          <input type="password" autoComplete="new-password" minLength={16} className={fieldControlClassName} placeholder={verificationConnected ? "Deixe vazio para manter o token salvo" : "Cole o token para confirmar correções"} value={verificationToken} onChange={(event) => setVerificationToken(event.target.value)} />
        </Field>
        {verificationConnected && <p className="m-0 text-support text-secondary">Token de verificação salvo.</p>}
        <Field label="Pasta do código Dogama">
          <input required className={fieldControlClassName} value={values.repositoryDirectory} onChange={(event) => setDraft({ ...draft, repositoryDirectory: event.target.value })} />
        </Field>
        <Field label="Conta GitHub" optional>
          <Select value={values.githubAccountId ?? ""} onChange={(event) => setDraft({ ...draft, githubAccountId: event.target.value || null })}>
            <option value="">Usar a conta do Bot Dogama</option>
            {accounts.map((account) => <option key={account.id} value={account.id} disabled={account.state !== "connected"}>{account.label}{account.state !== "connected" ? " · Reconectar" : ""}</option>)}
          </Select>
        </Field>
        <Field label="Limite de turnos por dia" optional={!values.analyze && !values.correct}>
          <input type="number" required={values.analyze || values.correct} min={1} max={10_000} step={1} className={fieldControlClassName} value={values.dailyTurnLimit ?? ""} onChange={(event) => setDraft({ ...draft, dailyTurnLimit: event.target.value ? Number(event.target.value) : null })} />
        </Field>
        <p className="m-0 text-support text-secondary">Defina o limite antes de ligar análises ou correções. Até {values.concurrency} casos trabalham ao mesmo tempo.</p>
        {([
          ["collect", "Receber erros"], ["analyze", "Analisar erros recebidos"],
          ["publish", "Publicar issues confirmadas"], ["correct", "Corrigir issues liberadas"],
          ["releaseCorrections", "Liberar novas issues para correção automaticamente"],
        ] as const).map(([key, label]) => <div key={key} className="flex items-center justify-between gap-4">
          <span className="text-control text-secondary">{label}</span>
          <Switch aria-label={label} checked={values[key]} onChange={(checked) => setDraft({ ...draft, [key]: checked })} />
        </div>)}
        <p className="m-0 text-support text-secondary">A liberação automática adiciona a etiqueta automation:fix às novas issues confirmadas.</p>
        <Button type="submit" className="self-start">{isPending ? "Salvando..." : "Salvar configuração do time"}</Button>
      </fieldset>
      {failure && <p role="alert" className="m-0 break-words text-support text-status-error">{failure.message}</p>}
    </form>
  )
}

function ErrorCaseDetails({ client, record, verificationConnected, onChanged }: { client: EngineClient; record: ErrorCase; verificationConnected: boolean; onChanged: () => void }) {
  const [reason, setReason] = useState("")
  const [verdict, setVerdict] = useState<ErrorDecision["verdict"]>("inconclusive")
  const { mutate: decide, isPending: deciding, error: decisionError } = useMutation(client.query.errorAutomation.decide.mutationOptions({ onSettled: onChanged }))
  const { mutate: reanalyze, isPending: reanalyzing, error: reanalysisError } = useMutation(client.query.errorAutomation.reanalyze.mutationOptions({ onSettled: onChanged }))
  const report = record.report
  const canDecide = record.state === "review" && !!report
  const failure = decisionError ?? reanalysisError

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
      <details>
        <summary className={disclosureClassName}>Revisar este caso</summary>
        <form className="mt-3 flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); decide({ caseId: record.id, revision: report?.revision ?? record.revision, verdict, reason: reason.trim() }) }}>
          {!canDecide && <p className="m-0 text-support text-secondary">Uma decisão pode ser registrada quando o relatório estiver aguardando revisão.</p>}
          <Field label="Decisão">
            <Select value={verdict} disabled={deciding || !canDecide} onChange={(event) => setVerdict(event.target.value as ErrorDecision["verdict"])}>
              <option value="inconclusive">Inconclusivo</option><option value="confirmed">Confirmar erro</option><option value="expected">Comportamento esperado</option><option value="external">Causa externa</option>
            </Select>
          </Field>
          <Field label="Motivo da decisão"><textarea required rows={3} className={fieldControlClassName} value={reason} disabled={deciding || !canDecide} onChange={(event) => setReason(event.target.value)} /></Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="secondary" disabled={deciding || reanalyzing || !canDecide || !reason.trim()}>{deciding ? "Registrando..." : "Registrar decisão"}</Button>
            <Button type="button" variant="secondary" disabled={deciding || reanalyzing} onClick={() => reanalyze({ caseId: record.id })}>{reanalyzing ? "Reenfileirando..." : "Reanalisar caso"}</Button>
          </div>
        </form>
      </details>
      {failure && <p role="alert" className="m-0 break-words text-support text-status-error">{failure.message}</p>}
      {record.prNumber !== null && <ErrorVerification client={client} record={record} verificationConnected={verificationConnected} onChanged={onChanged} />}
    </div>
  )
}

function ErrorVerification({ client, record, verificationConnected, onChanged }: { client: EngineClient; record: ErrorCase; verificationConnected: boolean; onChanged: () => void }) {
  const { mutate: verify, isPending, error } = useMutation(client.query.errorAutomation.verify.mutationOptions({ onSettled: onChanged }))

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    verify({ caseId: record.id, publishedVersion: String(fields.get("version")), evidence: String(fields.get("evidence")), representativeTraffic: String(fields.get("traffic")) })
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
