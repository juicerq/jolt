import type { ReactNode } from "react"
import {
  ChevronDownIcon,
  ClockIcon,
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
  UserPlusIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline"
import type { ConversationActivity } from "../../../shared/conversations"
import { blurMouseClick } from "../ui/blur-mouse-click"
import {
  formatChatActivityStepLabel,
  formatChatActivitySummary,
  formatRunningChatActivityStepLabel,
  getChatActivityStepDetails,
  splitChatActivitySteps,
  unknownToolName,
} from "./chat-activity-summary"
import { ChatContent, chatChipClassName, chatGuideClassName } from "./chat-content"
import { ChatStamp, ChatStamped } from "./chat-stamp"
import { formatChatWaitingMessage } from "./chat-waiting-messages"

type PersistedStep = ConversationActivity["steps"][number]
type PersistedThinkingStep = Extract<PersistedStep, { type: "thinking" }>
type PersistedToolStep = Extract<PersistedStep, { type: "tool" }>
type VisibleTool = Omit<PersistedToolStep["tools"][number], "status"> & { status: "running" | "done" | "failed" | "denied" }
type VisibleStep =
  | (PersistedThinkingStep & { status?: "running" | "done" })
  | (Omit<PersistedToolStep, "tools"> & { tools: VisibleTool[] })
type VisibleActivity = { steps: VisibleStep[] }
type ActivityStatus = "running" | "aborting" | "failed"
type StageMode = "compact" | "current" | "history" | "solo"
type StageStatus = "running" | "done" | "failed" | "denied"

const activityStageIconStatusClassNames: Record<StageStatus, string> = {
  running: "animate-pulse text-secondary [animation-duration:1200ms] motion-reduce:animate-none",
  done: "text-muted",
  failed: "text-status-error",
  denied: "text-muted",
}

function ActivityBlock({ botName, time, children }: { botName: string; time: string; children: ReactNode }) {
  return <ChatStamped className="mb-4 w-fit text-support text-muted" name={botName} time={time} anchor="line">{children}</ChatStamped>
}

export function ChatActivity({ activity, botName, time, status, waitingMessage }: { activity: VisibleActivity; botName: string; time: string; status?: ActivityStatus; waitingMessage?: string }) {
  const isPending = status === "running" || status === "aborting"
  const steps = splitChatActivitySteps(activity.steps)
  const hasDetails = steps.length > 0

  if (!hasDetails && !isPending) {
    return null
  }

  if (!hasDetails) {
    return (
      <ActivityBlock botName={botName} time={time}>
        <div className="grid w-fit grid-cols-[16px_auto] items-center gap-[7px]" role="status">
          <span className="mt-px size-3.5 animate-spin rounded-full border border-outline-strong border-t-primary [animation-duration:800ms] motion-reduce:animate-none" aria-hidden="true" />
          <span>{getActivityLabel(activity, botName, status, waitingMessage)}</span>
        </div>
      </ActivityBlock>
    )
  }

  if (isPending) {
    return <LiveActivity steps={steps} botName={botName} status={status} />
  }

  const [onlyStep] = steps
  const opensNothing = steps.length === 1 && (onlyStep.type === "thinking" ? !onlyStep.content.trim() : getChatActivityStepDetails(onlyStep).items.length === 0)

  if (opensNothing) {
    return (
      <ActivityBlock botName={botName} time={time}>
        <div className="grid w-fit grid-cols-[16px_auto] items-center gap-[7px] [&_svg]:stroke-[1.75]">
          <SparklesIcon className="size-4" aria-hidden="true" />
          <span aria-live="polite">{formatChatActivitySummary(activity)}</span>
        </div>
      </ActivityBlock>
    )
  }

  return (
    <div className="group mb-4 w-fit text-support text-muted">
      <details onClick={blurMouseClick} className="group/activity max-w-[620px] transition-[opacity,transform] duration-180 ease-out starting:translate-y-1 starting:opacity-0 motion-reduce:transition-none">
        <summary className={chatChipClassName}>
          <SparklesIcon className="size-4" aria-hidden="true" />
          <span aria-live="polite">{formatChatActivitySummary(activity)}</span>
          <ChevronDownIcon className="size-[13px] transition-transform duration-150 ease-out group-open/activity:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
          <ChatStamp name={botName} time={time} />
        </summary>
        <div className={steps.length === 1 ? `${chatGuideClassName} mt-1.5 mb-1 ml-[14px] grid py-1 pl-4` : "mt-2 mr-0 mb-1 ml-[30px] grid gap-0.5 pl-3"}>
          {steps.map((step, index) => <ActivityStage key={`${step.type}-${index}`} step={step} mode={steps.length === 1 ? "solo" : "history"} />)}
        </div>
      </details>
    </div>
  )
}

function LiveActivity({ steps, botName, status }: { steps: VisibleStep[]; botName: string; status: "running" | "aborting" }) {
  const label = status === "aborting" ? "Interrompendo resposta…" : `${botName ?? "O bot"} está trabalhando`
  const currentIndex = status === "aborting" ? -1 : steps.length - 1

  return (
    <div className="-mx-[7px] -mt-[5px] mb-[11px] grid w-fit max-w-[620px] gap-1 text-support text-muted" role="status" aria-label={label}>
      {steps.map((step, index) => (
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
  const { items: details, prose } = step.type === "tool" ? getChatActivityStepDetails(step) : { items: [], prose: false }
  const hasDetailList = details.length > 1
  const detailClassName = prose ? "text-support text-muted" : "font-mono text-metadata text-muted [overflow-wrap:anywhere] whitespace-pre-wrap"
  const stageModeClasses: Record<Exclude<StageMode, "solo">, string> = {
    compact: "px-[7px] py-[5px] transition-[opacity,transform] duration-150 ease-out starting:translate-y-0.5 starting:opacity-65 motion-reduce:transition-none",
    current: "gap-1.5 px-[7px] py-[5px] transition-[opacity,transform] duration-180 ease-out starting:translate-y-1 starting:opacity-0 motion-reduce:transition-none",
    history: "gap-0.5 px-[7px] py-[5px] before:absolute before:-top-1 before:-left-3 before:h-[17px] before:w-2.5 before:rounded-bl before:border-b before:border-l before:border-outline after:absolute after:top-[13px] after:bottom-[-4px] after:-left-3 after:w-px after:bg-outline last:after:hidden",
  }
  const heading = (
    <>
      <ActivityStageIcon step={step} status={status} />
      <div className="flex min-w-0 flex-wrap gap-x-2 gap-y-1">
        <strong className="text-support font-medium text-secondary">{label}</strong>
        {mode === "compact" && details.length === 1 && <ActivityDetail className={detailClassName} prose={prose}>{details[0]}</ActivityDetail>}
      </div>
      {hasDetailList && <ChevronDownIcon className="mt-px size-[13px] opacity-0 transition-[opacity,transform] duration-150 ease-out group-hover/stage:opacity-100 group-focus-within/stage:opacity-100 group-open/stage:rotate-180 motion-reduce:transition-none" aria-hidden="true" />}
    </>
  )

  if (mode === "solo") {
    return (
      <div className="grid min-w-0">
        {step.type === "thinking" && <ThinkingTrace content={step.content} />}
        {step.type === "tool" && (
          <ul className="m-0 grid list-none gap-0 p-0">
            {details.map((detail) => <li className="m-0 block min-w-0 border-0 p-0" key={detail}><ActivityDetail className={detailClassName} prose={prose}>{detail}</ActivityDetail></li>)}
          </ul>
        )}
      </div>
    )
  }

  return (
    <div className={`relative grid min-w-0 ${stageModeClasses[mode]}`} {...currentProps}>
      {hasDetailList
        ? (
            <details onClick={blurMouseClick} className="group/stage" open={mode !== "compact"}>
              <summary className="grid w-fit cursor-pointer list-none grid-cols-[15px_auto_13px] items-center gap-[7px] rounded-lg px-[7px] py-[5px] hover:bg-surface-hover hover:text-secondary focus-visible:bg-surface-hover focus-visible:text-secondary focus-visible:outline-none [&::-webkit-details-marker]:hidden">{heading}</summary>
              <ul className="m-0 ml-[23px] grid list-none gap-0 p-0">
                {details.map((detail) => <li className="m-0 block min-w-0 border-0 p-0" key={detail}><ActivityDetail className={detailClassName} prose={prose}>{detail}</ActivityDetail></li>)}
              </ul>
            </details>
          )
        : <div className="grid min-w-0 grid-cols-[15px_minmax(0,1fr)] items-start gap-2">{heading}</div>}
      {mode !== "compact" && step.type === "thinking" && step.content.trim() && <ThinkingTrace className={mode === "history" ? "ml-[23px] pt-0.5" : "ml-[23px] border-l border-outline pl-3"} content={step.content} />}
      {mode !== "compact" && details.length === 1 && <ActivityDetail className={`ml-[23px] block ${detailClassName} ${mode === "history" ? "pt-0.5" : "border-l border-outline py-1 pl-3"}`} prose={prose}>{details[0]}</ActivityDetail>}
    </div>
  )
}

function ActivityDetail({ children, className, prose }: { children: string; className: string; prose: boolean }) {
  if (prose) {
    return <span className={className}>{children}</span>
  }

  return <code className={className}>{children}</code>
}

function ThinkingTrace({ className = "", content }: { className?: string; content: string }) {
  return <div className={`${className} [&>div]:max-w-[68ch] [&>div]:py-1.5 [&>div]:text-support [&>div]:text-muted [&_li]:text-support [&_li]:text-inherit [&_p]:text-support [&_p]:text-inherit [&_strong]:text-support [&_strong]:text-inherit`}><ChatContent content={content} /></div>
}

function getStepStatus(step: VisibleStep, active: boolean) {
  if (step.type === "thinking") {
    return active ? step.status ?? "done" : "done"
  }

  if (step.tools.some((tool) => tool.status === "running")) {
    return active ? "running" : "failed"
  }

  if (step.tools.some((tool) => tool.status === "failed")) {
    return "failed"
  }

  return step.tools.some((tool) => tool.status === "denied") ? "denied" : "done"
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
    denied: "negada",
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

  if (step.name === "hire") {
    return { label: "contratação", icon: <UserPlusIcon {...iconProps} /> }
  }

  if (step.name === "transfer") {
    return { label: "transferência", icon: <UserGroupIcon {...iconProps} /> }
  }

  if (step.name === "routine" || step.name === "remove_routine") {
    return { label: "Rotina", icon: <ClockIcon {...iconProps} /> }
  }

  return { label: unknownToolName(step.tools, step.name), icon: <WrenchScrewdriverIcon {...iconProps} /> }
}
