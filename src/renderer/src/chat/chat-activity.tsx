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
  UserGroupIcon,
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
import { formatChatWaitingMessage } from "./chat-waiting-messages"

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
type StageStatus = "running" | "done" | "failed"

const activityStageIconStatusClassNames: Record<StageStatus, string> = {
  running: "animate-pulse text-secondary [animation-duration:1200ms] motion-reduce:animate-none",
  done: "text-muted",
  failed: "text-status-error",
}

export function ChatActivity({ activity, botName, status, waitingMessage }: { activity: VisibleActivity; botName?: string; status?: ActivityStatus; waitingMessage?: string }) {
  const isPending = status === "running" || status === "aborting"
  const hasDetails = activity.steps.length > 0

  if (!hasDetails && !isPending) {
    return null
  }

  if (!hasDetails) {
    return (
      <div className="mb-3 grid gap-1.5 text-support text-muted">
        <div className="grid w-fit grid-cols-[16px_auto] items-center gap-[7px] rounded-lg px-[7px] py-[5px]" role="status">
          <span className="mt-px size-3.5 animate-spin rounded-full border border-outline-strong border-t-primary [animation-duration:800ms] motion-reduce:animate-none" aria-hidden="true" />
          <span>{getActivityLabel(activity, botName, status, waitingMessage)}</span>
        </div>
      </div>
    )
  }

  if (isPending) {
    return <LiveActivity activity={activity} botName={botName} status={status} />
  }

  return (
    <div className="mb-3 grid gap-1.5 text-support text-muted">
      <details className="group/activity max-w-[620px] transition-[opacity,transform] duration-180 ease-out starting:translate-y-1 starting:opacity-0 motion-reduce:transition-none">
        <summary className="grid w-fit cursor-pointer list-none grid-cols-[16px_auto_14px] items-center gap-[7px] rounded-lg px-[7px] py-[5px] hover:bg-surface-hover hover:text-secondary focus-visible:bg-surface-hover focus-visible:text-secondary focus-visible:outline-none [&::-webkit-details-marker]:hidden [&_svg]:stroke-[1.75]">
          <SparklesIcon className="size-4" aria-hidden="true" />
          <span aria-live="polite">{formatChatActivitySummary(activity)}</span>
          <ChevronDownIcon className="size-[13px] transition-transform duration-150 ease-out group-open/activity:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
        </summary>
        <div className="mt-2 mr-0 mb-1 ml-[30px] grid gap-0.5 pl-3">
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
    <div className="mb-3 grid w-[min(620px,100%)] gap-1 text-support text-muted" role="status" aria-label={label}>
      {activity.steps.map((step, index) => (
        <ActivityStage key={`${step.type}-${index}`} step={step} mode={index === currentIndex ? "current" : "compact"} />
      ))}
      {status === "aborting" && (
        <div className="grid min-w-0 gap-1.5 px-[7px] py-[5px]" aria-current="step">
          <div className="grid min-w-0 grid-cols-[15px_minmax(0,1fr)] items-start gap-2">
            <span className="mt-px size-3.5 animate-spin rounded-full border border-outline-strong border-t-primary [animation-duration:800ms] motion-reduce:animate-none" role="status" aria-label="Em andamento" />
            <strong className="text-support font-medium text-secondary">Interrompendo resposta…</strong>
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
  const stageModeClasses = {
    compact: "px-[7px] py-[5px] transition-[opacity,transform] duration-150 ease-out starting:translate-y-0.5 starting:opacity-65 motion-reduce:transition-none",
    current: "gap-1.5 px-[7px] py-[5px] transition-[opacity,transform] duration-180 ease-out starting:translate-y-1 starting:opacity-0 motion-reduce:transition-none",
    history: "gap-0.5 px-[7px] py-[5px] before:absolute before:-top-1 before:-left-3 before:h-[17px] before:w-2.5 before:rounded-bl before:border-b before:border-l before:border-outline after:absolute after:top-[13px] after:bottom-[-4px] after:-left-3 after:w-px after:bg-outline last:after:hidden",
  }
  const heading = (
    <>
      <ActivityStageIcon step={step} status={status} />
      <div className="flex min-w-0 flex-wrap gap-x-2 gap-y-1">
        <strong className="text-support font-medium text-secondary">{label}</strong>
        {mode === "compact" && details.length === 1 && <code className="font-mono text-metadata text-muted [overflow-wrap:anywhere] whitespace-pre-wrap">{details[0]}</code>}
      </div>
      {hasDetailList && <ChevronDownIcon className="mt-px size-[13px] opacity-0 transition-[opacity,transform] duration-150 ease-out group-hover/stage:opacity-100 group-focus-within/stage:opacity-100 group-open/stage:rotate-180 motion-reduce:transition-none" aria-hidden="true" />}
    </>
  )

  return (
    <div className={`relative grid min-w-0 ${stageModeClasses[mode]}`} {...currentProps}>
      {hasDetailList
        ? (
            <details className="group/stage" open={mode !== "compact"}>
              <summary className="grid w-fit cursor-pointer list-none grid-cols-[15px_auto_13px] items-center gap-[7px] rounded-lg px-[7px] py-[5px] hover:bg-surface-hover hover:text-secondary focus-visible:bg-surface-hover focus-visible:text-secondary focus-visible:outline-none [&::-webkit-details-marker]:hidden">{heading}</summary>
              <ul className="m-0 ml-[23px] grid list-none gap-0 p-0">
                {details.map((detail) => <li className="m-0 block min-w-0 border-0 p-0" key={detail}><code className="font-mono text-metadata text-muted [overflow-wrap:anywhere] whitespace-pre-wrap">{detail}</code></li>)}
              </ul>
            </details>
          )
        : <div className="grid min-w-0 grid-cols-[15px_minmax(0,1fr)] items-start gap-2">{heading}</div>}
      {mode === "current" && step.type === "thinking" && step.content && <ThinkingTrace content={step.content} />}
      {mode !== "compact" && details.length === 1 && <code className={`ml-[23px] block font-mono text-metadata text-muted [overflow-wrap:anywhere] whitespace-pre-wrap ${mode === "history" ? "pt-0.5" : "border-l border-outline py-1 pl-3"}`}>{details[0]}</code>}
    </div>
  )
}

function ThinkingTrace({ content }: { content: string }) {
  return <div className="ml-[23px] border-l border-outline pl-3 [&>div]:max-w-[68ch] [&>div]:py-1.5 [&>div]:text-support [&>div]:text-muted [&_li]:text-support [&_li]:text-inherit [&_p]:text-support [&_p]:text-inherit [&_strong]:text-support [&_strong]:text-inherit"><ChatContent content={content} /></div>
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
    return formatChatWaitingMessage(waitingMessage ?? "Aguardando resposta de {name}…", botName ?? "o Bot")
  }

  return formatChatActivitySummary(activity)
}

function ActivityStageIcon({ step, status }: { step: VisibleStep; status: StageStatus }) {
  const statusLabels = {
    running: "em andamento",
    done: "concluída",
    failed: "com falha",
  }
  const { icon, label } = getActivityStageIcon(step)

  return <span className={`mt-px inline-flex size-3.5 [&_svg]:size-full [&_svg]:stroke-[1.75] ${activityStageIconStatusClassNames[status]}`} role="img" aria-label={`Atividade de ${label} ${statusLabels[status]}`}>{icon}</span>
}

function getActivityStageIcon(step: VisibleStep) {
  const iconProps = { "aria-hidden": true as const }

  if (step.type === "thinking") {
    return { label: "pensamento", icon: <LightBulbIcon {...iconProps} /> }
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

  if (step.name === "delegate") {
    return { label: "delegação", icon: <UserGroupIcon {...iconProps} /> }
  }

  if (step.name === "transfer") {
    return { label: "transferência", icon: <UserGroupIcon {...iconProps} /> }
  }

  return { label: step.name, icon: <WrenchScrewdriverIcon {...iconProps} /> }
}
