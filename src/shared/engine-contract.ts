import { eventIterator, oc } from "@orpc/contract"
import { type } from "arktype"
import { diagnosticExportResult, diagnosticsReport } from "./observability/diagnostics"
import { externalObservationSpan } from "./observability/observation"
import { providerAvailabilityList, providerModelsList } from "./providers"
import { botSchemas } from "./bots"
import { conversationSchemas } from "./conversations"
import { memorySchemas } from "./memory"
import { projectSchemas } from "./projects"
import { routineSchemas } from "./routines"
import { taskSchemas } from "./tasks"

const healthOutput = type({
  status: type.enumerated("ready"),
  runtime: "string",
  startedAt: "string",
})

export const engineContract = {
  health: oc.output(healthOutput).route({ method: "GET", path: "/health" }),
  diagnostics: {
    get: oc.output(diagnosticsReport).route({ method: "GET", path: "/diagnostics" }),
    export: oc.output(diagnosticExportResult).route({ method: "POST", path: "/diagnostics/export" }),
  },
  providers: {
    list: oc.output(providerAvailabilityList).route({ method: "GET", path: "/providers" }),
    models: oc.output(providerModelsList).route({ method: "GET", path: "/providers/models" }),
  },
  projects: {
    create: oc.input(projectSchemas.createInput).output(projectSchemas.project).route({ method: "POST", path: "/projects" }),
    list: oc.output(projectSchemas.groupedList).route({ method: "GET", path: "/projects" }),
  },
  bots: {
    create: oc.input(botSchemas.createInput).output(botSchemas.bot).route({ method: "POST", path: "/bots" }),
    list: oc.output(botSchemas.botList).route({ method: "GET", path: "/bots" }),
    get: oc.input(botSchemas.idInput).output(botSchemas.bot).route({ method: "GET", path: "/bots/{id}" }),
    update: oc.input(botSchemas.updateInput).output(botSchemas.bot).route({ method: "POST", path: "/bots/{id}/update" }),
    remove: oc.input(botSchemas.idInput).route({ method: "POST", path: "/bots/{id}/remove" }),
  },
  conversations: {
    history: oc.input(conversationSchemas.historyInput).output(conversationSchemas.history).route({ method: "GET", path: "/bots/{botId}/messages" }),
    events: oc.output(eventIterator(conversationSchemas.botEvent)).route({ method: "GET", path: "/conversations/events" }),
    send: oc.input(conversationSchemas.sendInput).route({ method: "POST", path: "/bots/{botId}/messages" }),
    abort: oc.input(conversationSchemas.botInput).route({ method: "POST", path: "/bots/{botId}/abort" }),
    related: oc.input(conversationSchemas.taskInput).output(conversationSchemas.messageList).route({ method: "GET", path: "/tasks/{taskId}/messages" }),
  },
  tasks: {
    listForLeader: oc.input(taskSchemas.leaderInput).output(taskSchemas.taskList).route({ method: "GET", path: "/bots/{leaderBotId}/tasks" }),
  },
  routines: {
    create: oc.input(routineSchemas.createInput).output(routineSchemas.routine).route({ method: "POST", path: "/routines" }),
    list: oc.input(routineSchemas.botInput).output(routineSchemas.routineList).route({ method: "GET", path: "/bots/{botId}/routines" }),
    update: oc.input(routineSchemas.updateInput).output(routineSchemas.routine).route({ method: "POST", path: "/routines/{id}/update" }),
    remove: oc.input(routineSchemas.idInput).route({ method: "POST", path: "/routines/{id}/remove" }),
  },
  memory: {
    list: oc.input(memorySchemas.botInput).output(memorySchemas.memoryList).route({ method: "GET", path: "/bots/{botId}/memories" }),
    add: oc.input(memorySchemas.addInput).output(memorySchemas.memory).route({ method: "POST", path: "/bots/{botId}/memories" }),
    forget: oc.input(memorySchemas.idInput).route({ method: "POST", path: "/memories/{id}/forget" }),
    clear: oc.input(memorySchemas.botInput).route({ method: "POST", path: "/bots/{botId}/memories/clear" }),
  },
  observations: {
    rendererSpan: oc.input(externalObservationSpan).route({ method: "POST", path: "/observations/renderer-span" }),
  },
}
