import type { Bot } from "@src/shared/bots"
import { parse } from "@src/shared/parse"
import { githubTriggerEvents, triggerSchemas, type ExternalEvent, type Trigger, type TriggerRun } from "@src/shared/triggers"
import type { createBots } from "../bots/bots"
import type { Observability } from "../observability/observability"
import type { AppDatabase } from "../persistence/database"
import type { PiCustomTool } from "../pi/pi-agent-runtime"

const retryDelayMs = 1_000

function matches(trigger: Trigger, accountId: string, event: ExternalEvent) {
  if (trigger.accountId !== accountId || trigger.source !== event.source || trigger.event !== event.event) {
    return false
  }

  if (!trigger.actions.includes(event.action) || !trigger.repositories.some((repository) => repository.id === event.repository.id)) {
    return false
  }

  if (event.ownEvent && !trigger.includeOwnEvents) {
    return false
  }

  return trigger.labels.every((label) => event.labels.includes(label))
}

function repositoriesFrom(value: string) {
  return value.split(",").map((entry) => entry.trim()).filter(Boolean).map((entry) => {
    const separator = entry.indexOf("=")
    const id = entry.slice(0, separator).trim()
    const fullName = entry.slice(separator + 1).trim()

    if (separator < 1 || !id || !fullName) {
      throw new Error("Give repositories as id=owner/name, separated by commas")
    }

    return { id, fullName }
  })
}

function describe(trigger: Trigger) {
  return `${trigger.id}: "${trigger.name}" — ${trigger.event}.${trigger.actions.join("|")} in ${trigger.repositories.map((repository) => repository.fullName).join(", ")}, ${trigger.status}. ${trigger.instruction}`
}

export function createTriggers(input: {
  database: AppDatabase
  bots: Pick<ReturnType<typeof createBots>, "get">
  observability: Observability
  conversations: { active(botId: string): unknown; callTrigger(call: { trigger: Trigger; run: TriggerRun }): Promise<void> }
}) {
  const draining = new Set<string>()
  let retryTimer: ReturnType<typeof setTimeout> | undefined

  input.database.triggerRuns.recoverRunning(new Date().toISOString())

  function existing(id: string, botId?: string) {
    const trigger = input.database.triggers.get(id)

    if (!trigger || (botId && trigger.botId !== botId)) {
      throw new Error("Gatilho not found")
    }

    return trigger
  }

  function githubAccounts(botId: string) {
    return input.database.accesses.listForBot(botId).flatMap((access) => {
      const account = input.database.accounts.get(access.accountId)

      if (account?.pluginId !== "github") {
        return []
      }

      return [account]
    })
  }

  function hasAccess(trigger: Trigger) {
    return input.database.accesses.listForBot(trigger.botId).some((access) => access.accountId === trigger.accountId)
  }

  function accountFor(botId: string, requested: string | undefined, current?: Trigger) {
    const accounts = githubAccounts(botId)

    if (!requested && current) {
      const currentAccount = accounts.find((account) => account.id === current.accountId)

      if (currentAccount) {
        return currentAccount
      }
    }

    if (!requested && accounts.length === 1) {
      return accounts[0]
    }

    const account = accounts.find((candidate) => candidate.id === requested || candidate.label === requested)

    if (!account) {
      throw new Error(`Choose a GitHub Conta. Available: ${accounts.map((candidate) => candidate.label).join(", ") || "none"}`)
    }

    return account
  }

  function create(rawInput: unknown) {
    const details = parse(triggerSchemas.createInput, rawInput)
    const bot = input.bots.get({ id: details.botId })
    const account = input.database.accounts.get(details.accountId)
    const granted = input.database.accesses.listForBot(details.botId).some((access) => access.accountId === details.accountId)

    if (!bot || bot.temporary) {
      throw new Error("A permanent Bot is required")
    }

    if (account?.pluginId !== "github" || !granted) {
      throw new Error("The Bot has no Acesso to that GitHub Conta")
    }

    const trigger = parse(triggerSchemas.trigger, { id: crypto.randomUUID(), ...details, source: "github", createdAt: new Date().toISOString() })

    return input.database.triggers.create(trigger)
  }

  function update(rawInput: unknown) {
    const details = parse(triggerSchemas.updateInput, rawInput)
    const trigger = existing(details.id)
    const updated = input.database.triggers.update(trigger.id, details)

    if (!updated) {
      throw new Error("Gatilho not found")
    }

    return updated
  }

  function remove(rawInput: unknown) {
    const { id } = parse(triggerSchemas.idInput, rawInput)
    const trigger = existing(id)
    input.database.triggers.remove(trigger.id)
  }

  function scheduleRetry() {
    if (retryTimer) {
      return
    }

    retryTimer = setTimeout(() => {
      retryTimer = undefined
      drain()
    }, retryDelayMs)
  }

  async function drainBot(botId: string) {
    if (draining.has(botId)) {
      return
    }

    draining.add(botId)

    try {
      while (!input.conversations.active(botId)) {
        const run = input.database.triggerRuns.listQueued().find((candidate) => candidate.botId === botId)

        if (!run) {
          return
        }

        const trigger = input.database.triggers.get(run.triggerId)

        if (trigger?.status !== "active" || !hasAccess(trigger)) {
          input.database.triggerRuns.update(run.id, { status: "ignored", finishedAt: new Date().toISOString() })
          continue
        }

        input.database.triggerRuns.update(run.id, { status: "running", startedAt: new Date().toISOString() })
        await input.conversations.callTrigger({ trigger, run }).then(
          () => input.database.triggerRuns.update(run.id, { status: "completed", finishedAt: new Date().toISOString() }),
          (error: unknown) => input.database.triggerRuns.update(run.id, { status: "failed", error: error instanceof Error ? error.message : "Gatilho failed", finishedAt: new Date().toISOString() }),
        )
      }
    } finally {
      draining.delete(botId)

      if (input.database.triggerRuns.listQueued().some((run) => run.botId === botId)) {
        scheduleRetry()
      }
    }
  }

  function drain() {
    const botIds = new Set(input.database.triggerRuns.listQueued().map((run) => run.botId))

    for (const botId of botIds) {
      void drainBot(botId)
    }
  }

  function ingest(accountId: string, rawEvent: unknown) {
    const event = parse(triggerSchemas.externalEvent, rawEvent)
    const now = new Date().toISOString()

    for (const trigger of input.database.triggers.listActive()) {
      if (!hasAccess(trigger) || !matches(trigger, accountId, event)) {
        continue
      }

      const run = parse(triggerSchemas.triggerRun, { id: crypto.randomUUID(), triggerId: trigger.id, botId: trigger.botId, deliveryId: event.deliveryId, event, status: "queued", error: null, createdAt: now, startedAt: null, finishedAt: null })
      const created = input.database.triggerRuns.create(run)

      if (created) {
        input.observability.event({ name: "trigger.queued", context: { botId: trigger.botId }, attributes: { source: trigger.source, event: `${event.event}.${event.action}` } })
      }
    }

    drain()
  }

  function csv(value: string | undefined, fallback: string[] | undefined) {
    if (value === undefined) {
      return fallback
    }

    return value.split(",").map((item) => item.trim()).filter(Boolean)
  }

  function selectedStatus(value: string | undefined, current: Trigger | undefined) {
    if (value === undefined) {
      return current?.status ?? "active"
    }

    if (value === "no") {
      return "paused"
    }

    return "active"
  }

  function selectedOwnEvents(value: string | undefined, current: Trigger | undefined) {
    if (value === undefined) {
      return current?.includeOwnEvents ?? false
    }

    return value === "yes"
  }

  function textFields(params: Record<string, string>, current: Trigger | undefined) {
    return {
      name: params.name?.trim() || current?.name,
      event: params.event?.trim() || current?.event,
      instruction: params.instruction?.trim() || current?.instruction,
    }
  }

  function conditionFields(params: Record<string, string>, current: Trigger | undefined) {
    return {
      actions: csv(params.actions, current?.actions),
      repositories: params.repositories ? repositoriesFrom(params.repositories) : current?.repositories,
      labels: csv(params.labels, current?.labels ?? []),
      includeOwnEvents: selectedOwnEvents(params.includeOwnEvents, current),
      status: selectedStatus(params.enabled, current),
    }
  }

  function saveGithubTrigger(bot: Bot, params: Record<string, string>) {
    const current = params.id ? existing(params.id, bot.id) : undefined
    const account = accountFor(bot.id, params.conta, current)
    const { name, event, instruction } = textFields(params, current)
    const { actions, repositories, labels, includeOwnEvents, status } = conditionFields(params, current)

    if (!name || !event || !actions || !repositories || !labels || !instruction) {
      throw new Error("Give name, event, actions, repositories and instruction")
    }

    const fields = parse(triggerSchemas.updateInput.omit({ id: true }), { name, event, actions, repositories, labels, instruction, includeOwnEvents, status })

    if (current) {
      return { created: false, trigger: update({ id: current.id, ...fields }) }
    }

    return { created: true, trigger: create({ botId: bot.id, accountId: account.id, ...fields }) }
  }

  const tools = (bot: Bot): PiCustomTool[] => {
    if (bot.temporary) {
      return []
    }

    return [{
      name: "github_trigger",
      description: "Create or change one GitHub Gatilho. A Gatilho calls you only when a matching GitHub event arrives. The event, actions, repositories and labels are deterministic conditions; instruction says what you do after the match.",
      parameters: {
        "id?": "Id of the Gatilho to change. Omit to create.",
        "name?": "Short name. Required to create.",
        "conta?": "GitHub Conta label or id. Required when you have more than one.",
        "event?": `One of ${githubTriggerEvents.join(", ")}. Required to create.`,
        "actions?": "Comma-separated GitHub actions such as opened, reopened or synchronize. Required to create.",
        "repositories?": "Comma-separated repositories as id=owner/name. Get ids from github_repositories. Required to create.",
        "labels?": "Optional comma-separated labels. Every listed label must be present.",
        "instruction?": "What you do after the event matches. Required to create.",
        "includeOwnEvents?": "yes to match events created by the Jolt GitHub App. Defaults to no.",
        "enabled?": "no to pause, yes to activate. Defaults to yes.",
      },
      async execute(params) {
        const result = saveGithubTrigger(bot, params)

        return `Gatilho ${result.created ? "created" : "changed"}: ${describe(result.trigger)}`
      },
    }, {
      name: "remove_github_trigger",
      description: "Remove one GitHub Gatilho for good.",
      parameters: { id: "Id of the Gatilho" },
      async execute(params) {
        const trigger = existing(params.id ?? "", bot.id)
        remove({ id: trigger.id })

        return `Gatilho "${trigger.name}" removed.`
      },
    }]
  }

  drain()

  return {
    create,
    update,
    remove,
    ingest,
    tools,
    list(rawInput: unknown) {
      const { botId } = parse(triggerSchemas.botInput, rawInput)

      return input.database.triggers.listForBot(botId)
    },
    instructions(bot: Pick<Bot, "id" | "temporary">) {
      if (bot.temporary) {
        return ""
      }

      const triggers = input.database.triggers.listForBot(bot.id)

      return [
        "A turn with cause \"trigger\" is a Disparo from one of your Gatilhos, not a message from the person. Read the current GitHub state before acting because the Evento may be old. Events do not call you unless they match a Gatilho.",
        "Use github_trigger when the person asks you to act whenever a GitHub event occurs. Conditions are structured. Never broaden an event or action beyond what the person said. Ignore your own GitHub events unless the person explicitly asks for chaining.",
        ...(triggers.length > 0 ? ["Your GitHub Gatilhos:", ...triggers.map((trigger) => `- ${describe(trigger)}`)] : ["You have no GitHub Gatilhos."]),
      ].join("\n")
    },
    dispose() {
      clearTimeout(retryTimer)
    },
  }
}
