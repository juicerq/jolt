import { eventIterator, oc } from "@orpc/contract"
import { z } from "zod"
import { diagnosticExportResult, diagnosticsReport } from "./observability/diagnostics"
import { externalObservationSpan } from "./observability/observation"
import { providerAvailabilityList, providerConnectInput, providerDisconnectInput, providerModelsList } from "./providers"
import { botSchemas } from "./bots"
import { conversationSchemas } from "./conversations"
import { memorySchemas } from "./memory"
import { projectSchemas } from "./projects"
import { permissionSchemas } from "./permissions"
import { pluginSchemas } from "./plugins"
import { routineSchemas } from "./routines"
import { taskSchemas } from "./tasks"
import { triggerSchemas } from "./triggers"

const healthOutput = z.object({
  status: z.literal("ready"),
  runtime: z.string(),
  startedAt: z.string(),
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
    connect: oc.input(providerConnectInput).output(providerAvailabilityList).route({ method: "POST", path: "/providers/connect" }),
    disconnect: oc.input(providerDisconnectInput).output(providerAvailabilityList).route({ method: "POST", path: "/providers/disconnect" }),
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
    updateExecution: oc.input(botSchemas.updateExecutionInput).output(botSchemas.bot).route({ method: "POST", path: "/bots/{id}/execution" }),
    remove: oc.input(botSchemas.idInput).route({ method: "POST", path: "/bots/{id}/remove" }),
    removeColleague: oc.input(botSchemas.colleagueInput).route({ method: "POST", path: "/bots/{botId}/colleagues/{colleagueBotId}/remove" }),
  },
  conversations: {
    history: oc.input(conversationSchemas.historyInput).output(conversationSchemas.history).route({ method: "GET", path: "/bots/{botId}/messages" }),
    events: oc.output(eventIterator(conversationSchemas.botEvent)).route({ method: "GET", path: "/conversations/events" }),
    send: oc.input(conversationSchemas.sendInput).route({ method: "POST", path: "/bots/{botId}/messages" }),
    compact: oc.input(conversationSchemas.compactInput).output(conversationSchemas.compactionResult).route({ method: "POST", path: "/bots/{botId}/compact" }),
    abort: oc.input(conversationSchemas.botInput).route({ method: "POST", path: "/bots/{botId}/abort" }),
    promote: oc.input(conversationSchemas.queueInput).route({ method: "POST", path: "/bots/{botId}/queue/{id}/promote" }),
    unqueue: oc.input(conversationSchemas.queueInput).route({ method: "POST", path: "/bots/{botId}/queue/{id}/remove" }),
    related: oc.input(conversationSchemas.taskInput).output(conversationSchemas.messageList).route({ method: "GET", path: "/tasks/{taskId}/messages" }),
  },
  permissions: {
    decide: oc.input(permissionSchemas.decideInput).route({ method: "POST", path: "/bots/{botId}/permission-requests/{requestId}" }),
  },
  tasks: {
    listForBot: oc.input(taskSchemas.botInput).output(taskSchemas.taskList).route({ method: "GET", path: "/bots/{botId}/tasks" }),
  },
  routines: {
    create: oc.input(routineSchemas.createInput).output(routineSchemas.routine).route({ method: "POST", path: "/routines" }),
    list: oc.input(routineSchemas.botInput).output(routineSchemas.routineList).route({ method: "GET", path: "/bots/{botId}/routines" }),
    update: oc.input(routineSchemas.updateInput).output(routineSchemas.routine).route({ method: "POST", path: "/routines/{id}/update" }),
    remove: oc.input(routineSchemas.idInput).route({ method: "POST", path: "/routines/{id}/remove" }),
  },
  triggers: {
    create: oc.input(triggerSchemas.createInput).output(triggerSchemas.trigger).route({ method: "POST", path: "/triggers" }),
    list: oc.input(triggerSchemas.botInput).output(triggerSchemas.triggerList).route({ method: "GET", path: "/bots/{botId}/triggers" }),
    update: oc.input(triggerSchemas.updateInput).output(triggerSchemas.trigger).route({ method: "POST", path: "/triggers/{id}/update" }),
    remove: oc.input(triggerSchemas.idInput).route({ method: "POST", path: "/triggers/{id}/remove" }),
  },
  memory: {
    settings: oc.output(memorySchemas.settings).route({ method: "GET", path: "/memory/settings" }),
    configure: oc.input(memorySchemas.configure).route({ method: "POST", path: "/memory/settings" }),
    status: oc.output(memorySchemas.status).route({ method: "GET", path: "/memory/status" }),
    retry: oc.input(memorySchemas.botInput).route({ method: "POST", path: "/bots/{botId}/memory/retry" }),
    list: oc.input(memorySchemas.botInput).output(memorySchemas.memoryList).route({ method: "GET", path: "/bots/{botId}/memories" }),
    add: oc.input(memorySchemas.addInput).output(memorySchemas.memory).route({ method: "POST", path: "/bots/{botId}/memories" }),
    update: oc.input(memorySchemas.updateInput).output(memorySchemas.memory).route({ method: "POST", path: "/memories/{id}/update" }),
    forget: oc.input(memorySchemas.idInput).route({ method: "POST", path: "/memories/{id}/forget" }),
    clear: oc.input(memorySchemas.botInput).route({ method: "POST", path: "/bots/{botId}/memories/clear" }),
  },
  plugins: {
    list: oc.output(pluginSchemas.snapshot).route({ method: "GET", path: "/plugins" }),
    addCustom: oc.input(pluginSchemas.addCustomInput).output(pluginSchemas.snapshot).route({ method: "POST", path: "/plugins" }),
    remove: oc.input(pluginSchemas.idInput).output(pluginSchemas.snapshot).route({ method: "POST", path: "/plugins/{id}/remove" }),
    connect: oc.input(pluginSchemas.connectInput).output(pluginSchemas.connectOutput).route({ method: "POST", path: "/plugins/{pluginId}/connect" }),
    connectionSteps: oc.input(pluginSchemas.connectionInput).output(eventIterator(pluginSchemas.step)).route({ method: "GET", path: "/plugins/connections/{connectionId}/steps" }),
    awaitConnection: oc.input(pluginSchemas.connectionInput).output(pluginSchemas.snapshot).route({ method: "POST", path: "/plugins/connections/{connectionId}" }),
    disconnect: oc.input(pluginSchemas.accountInput).output(pluginSchemas.snapshot).route({ method: "POST", path: "/plugins/accounts/{accountId}/disconnect" }),
    grant: oc.input(pluginSchemas.grantInput).output(pluginSchemas.snapshot).route({ method: "POST", path: "/bots/{botId}/accounts/{accountId}" }),
    decide: oc.input(pluginSchemas.decideInput).route({ method: "POST", path: "/bots/{botId}/plugin-requests/{requestId}" }),
  },
  observations: {
    rendererSpan: oc.input(externalObservationSpan).route({ method: "POST", path: "/observations/renderer-span" }),
  },
}
