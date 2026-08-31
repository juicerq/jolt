import {
  ChevronDownIcon,
  CommandLineIcon,
  DocumentMagnifyingGlassIcon,
  DocumentPlusIcon,
  DocumentTextIcon,
  FolderOpenIcon,
  LightBulbIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  SparklesIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline"
import type { ConversationActivity } from "../../../shared/conversations"
import {
  formatChatActivityStepLabel,
  formatChatActivitySummary,
  formatRunningChatActivityStepLabel,
  getChatActivityStepDetails,
} from "./chat-activity-summary"
import { ChatContent } from "./chat-content"

type PersistedStep = ConversationActivity["steps"][number]
type PersistedThinkingStep = Extract<PersistedStep, { type: "thinking" }>
type PersistedToolStep = Extract<PersistedStep, { type: "tool" }>
type VisibleTool = Omit<PersistedToolStep["tools"][number], "status"> & { status: "running" | "done" | "failed" }
type VisibleStep =
  | (PersistedThinkingStep & { status?: "running" | "done" })
  | (Omit<PersistedToolStep, "tools"> & { tools: VisibleTool[] })
type VisibleActivity = { steps: VisibleStep[] }
type ActivityStatus = "running" | "aborting" | "failed"
type StageMode = "compact" | "current" | "history"

export function ChatActivity({ activity, botName, status, waitingMessage }: { activity: VisibleActivity; botName?: string; status?: ActivityStatus; waitingMessage?: string }) {
  const isPending = status === "running" || status === "aborting"
  const hasDetails = activity.steps.length > 0

  if (!hasDetails && !isPending) {
    return null
  }

  if (!hasDetails) {
    return (
      <div className="chat-activity">
        <div className="chat-activity-status" role="status">
          <span className="tool-activity-spinner" aria-hidden="true" />
          <span>{getActivityLabel(activity, botName, status, waitingMessage)}</span>
        </div>
      </div>
    )
  }

  if (isPending) {
    return <LiveActivity activity={activity} botName={botName} status={status} />
  }

  return (
    <div className="chat-activity">
      <details className="chat-activity-details">
        <summary>
          <SparklesIcon aria-hidden="true" />
          <span aria-live="polite">{formatChatActivitySummary(activity)}</span>
          <ChevronDownIcon aria-hidden="true" />
        </summary>
        <div className="chat-activity-content">
          {activity.steps.map((step, index) => <ActivityStage key={`${step.type}-${index}`} step={step} mode="history" />)}
        </div>
      </details>
    </div>
  )
}

function LiveActivity({ activity, botName, status }: { activity: VisibleActivity; botName?: string; status: "running" | "aborting" }) {
  const label = status === "aborting" ? "Interrompendo resposta…" : `${botName ?? "O bot"} está trabalhando`
  const currentIndex = status === "aborting" ? -1 : activity.steps.length - 1

  return (
    <div className="chat-activity chat-activity-live" role="status" aria-label={label}>
      {activity.steps.map((step, index) => (
        <ActivityStage key={`${step.type}-${index}`} step={step} mode={index === currentIndex ? "current" : "compact"} />
      ))}
      {status === "aborting" && (
        <div className="chat-activity-stage current" aria-current="step">
          <div className="chat-activity-stage-heading">
            <span className="tool-activity-spinner" role="status" aria-label="Em andamento" />
            <strong>Interrompendo resposta…</strong>
          </div>
        </div>
      )}
    </div>
  )
}

function ActivityStage({ mode, step }: { mode: StageMode; step: VisibleStep }) {
  const status = getStepStatus(step, mode === "current")
  const currentProps = mode === "current" && status === "running" ? { "aria-current": "step" as const } : {}
  const label = status === "running" ? formatRunningChatActivityStepLabel(step) : formatChatActivityStepLabel(step)
  const details = step.type === "tool" ? getChatActivityStepDetails(step) : []
  const hasDetailList = details.length > 1
  const heading = (
    <>
      <ActivityStageIcon step={step} status={status} />
      <div>
        <strong>{label}</strong>
        {mode === "compact" && details.length === 1 && <code>{details[0]}</code>}
      </div>
      {hasDetailList && <ChevronDownIcon className="chat-activity-stage-chevron" aria-hidden="true" />}
    </>
  )

  return (
    <div className={`chat-activity-stage ${mode} ${status}`} {...currentProps}>
      {hasDetailList
        ? (
            <details className="chat-activity-stage-disclosure" open={mode !== "compact"}>
              <summary className="chat-activity-stage-heading">{heading}</summary>
              <ul className="chat-activity-stage-list">
                {details.map((detail) => <li key={detail}><code>{detail}</code></li>)}
              </ul>
            </details>
          )
        : <div className="chat-activity-stage-heading">{heading}</div>}
      {mode === "current" && step.type === "thinking" && step.content && <ThinkingTrace content={step.content} />}
      {mode !== "compact" && details.length === 1 && <code className="chat-activity-stage-detail">{details[0]}</code>}
    </div>
  )
}

function ThinkingTrace({ content }: { content: string }) {
  return <div className="thinking-trace"><ChatContent content={content} /></div>
}

function getStepStatus(step: VisibleStep, active: boolean) {
  if (step.type === "thinking") {
    return active ? step.status ?? "done" : "done"
  }

  if (step.tools.some((tool) => tool.status === "running")) {
    return active ? "running" : "failed"
  }

  return step.tools.some((tool) => tool.status === "failed") ? "failed" : "done"
}

function getActivityLabel(activity: VisibleActivity, botName?: string, status?: ActivityStatus, waitingMessage?: string) {
  if (status === "aborting") {
    return "Interrompendo resposta…"
  }

  if (status === "running") {
    return waitingMessage ?? `Aguardando resposta de ${botName ?? "o Bot"}…`
  }

  return formatChatActivitySummary(activity)
}

function ActivityStageIcon({ step, status }: { step: VisibleStep; status: "running" | "done" | "failed" }) {
  const statusLabels = {
    running: "em andamento",
    done: "concluída",
    failed: "com falha",
  }
  const { icon, label } = getActivityStageIcon(step)

  return <span className="chat-activity-stage-icon" role="img" aria-label={`Atividade de ${label} ${statusLabels[status]}`}>{icon}</span>
}

function getActivityStageIcon(step: VisibleStep) {
  const iconProps = { "aria-hidden": true as const }

  if (step.type === "thinking") {
    return { label: "raciocínio", icon: <LightBulbIcon {...iconProps} /> }
  }

  if (step.name === "read") {
    return { label: "leitura", icon: <DocumentTextIcon {...iconProps} /> }
  }

  if (step.name === "grep") {
    return { label: "busca no código", icon: <DocumentMagnifyingGlassIcon {...iconProps} /> }
  }

  if (step.name === "find") {
    return { label: "busca por arquivos", icon: <MagnifyingGlassIcon {...iconProps} /> }
  }

  if (step.name === "ls") {
    return { label: "listagem de pasta", icon: <FolderOpenIcon {...iconProps} /> }
  }

  if (step.name === "edit") {
    return { label: "edição", icon: <PencilSquareIcon {...iconProps} /> }
  }

  if (step.name === "write") {
    return { label: "criação de arquivo", icon: <DocumentPlusIcon {...iconProps} /> }
  }

  if (step.name === "bash") {
    return { label: "comando", icon: <CommandLineIcon {...iconProps} /> }
  }

  return { label: step.name, icon: <WrenchScrewdriverIcon {...iconProps} /> }
}
