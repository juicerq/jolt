import type { Bot } from "../../shared/bots"
import { routineSchemas, type Frequency, type Routine } from "../../shared/routines"
import { weekdays } from "../../shared/weekdays"
import type { createBots } from "../bots/bots"
import type { Observability } from "../observability/observability"
import type { AppDatabase } from "../persistence/database"
import type { PiCustomTool } from "../pi/pi-agent-runtime"
import { parse } from "../../shared/parse"

const minute = 60_000
const longestWait = 60 * minute

export function nextCall(frequency: Frequency, from: Date) {
  if (frequency.form === "interval") {
    return new Date(from.getTime() + frequency.everyMinutes * minute)
  }

  if (frequency.form === "once") {
    const at = new Date(frequency.at)

    if (at <= from) {
      throw new Error("That time has passed")
    }

    return at
  }

  const [hours = 0, minutes = 0] = frequency.time.split(":").map(Number)

  for (let offset = 0; offset <= 7; offset++) {
    const candidate = new Date(from)
    candidate.setDate(from.getDate() + offset)
    candidate.setHours(hours, minutes, 0, 0)
    const weekday = weekdays[(candidate.getDay() + 6) % 7]
    const chosenDay = weekday !== undefined && frequency.days.includes(weekday)

    if (chosenDay && candidate > from) {
      return candidate
    }
  }

  throw new Error("The Frequência has no next call")
}

function describeFrequency(frequency: Frequency) {
  if (frequency.form === "interval") {
    return `every ${frequency.everyMinutes} minutes`
  }

  if (frequency.form === "once") {
    return `once at ${frequency.at}`
  }

  return `${frequency.days.join(", ")} at ${frequency.time}`
}

function parseAt(text: string, now: Date) {
  const match = text.trim().match(/^(?:(\d{4})-(\d{2})-(\d{2})[ T])?([01]\d|2[0-3]):([0-5]\d)$/)

  if (!match) {
    throw new Error('Give at as "HH:MM" or "YYYY-MM-DD HH:MM"')
  }

  const [, year, month, day, hours, minutes] = match
  const at = new Date(now)
  at.setSeconds(0, 0)

  if (year) {
    at.setFullYear(Number(year), Number(month) - 1, Number(day))
  }

  at.setHours(Number(hours), Number(minutes))

  if (!year && at <= now) {
    at.setDate(at.getDate() + 1)
  }

  return at
}

function frequencyFrom(params: Record<string, string>, current?: Routine) {
  if (params.everyMinutes) {
    return parse(routineSchemas.frequency, { form: "interval", everyMinutes: Number(params.everyMinutes) })
  }

  if (params.inMinutes) {
    return parse(routineSchemas.frequency, { form: "once", at: new Date(Date.now() + Number(params.inMinutes) * minute).toISOString() })
  }

  if (params.at) {
    return parse(routineSchemas.frequency, { form: "once", at: parseAt(params.at, new Date()).toISOString() })
  }

  if (params.days || params.time) {
    return parse(routineSchemas.frequency, { form: "fixed-time", days: (params.days ?? "").split(",").map((day) => day.trim().toLowerCase()).filter(Boolean), time: params.time ?? "" })
  }

  if (current) {
    return current.frequency
  }

  throw new Error("Give everyMinutes for an interval, days and time for a fixed time, or inMinutes or at for a single call")
}

export function createRoutines(input: {
  database: AppDatabase
  bots: ReturnType<typeof createBots>
  observability: Observability
  conversations: { call(routine: Routine): Promise<void> }
}) {
  let timer: ReturnType<typeof setTimeout> | undefined

  function schedule() {
    clearTimeout(timer)
    const [earliest] = input.database.routines.listEnabled()

    if (!earliest) {
      return
    }

    const delay = Math.min(Math.max(Date.parse(earliest.nextCallAt) - Date.now(), 0), longestWait)
    timer = setTimeout(() => {
      fire().catch((error) => {
        input.observability.event({ name: "routines.firefailed", error })
      })
    }, delay)
  }

  async function fire() {
    const now = new Date()
    const due = input.database.routines.listEnabled().filter((routine) => Date.parse(routine.nextCallAt) <= now.getTime())

    for (const routine of due) {
      if (routine.frequency.form === "once") {
        input.database.routines.remove(routine.id)
      } else {
        input.database.routines.update(routine.id, { nextCallAt: nextCall(routine.frequency, now).toISOString() })
      }

      await input.conversations.call(routine).then(
        () => input.observability.event({ name: "routines.called", context: { botId: routine.botId } }),
        (error) => input.observability.event({ name: "routines.skipped", context: { botId: routine.botId }, error }),
      )
    }

    schedule()
  }

  function owner(botId: string) {
    const bot = input.bots.get({ id: botId })

    if (!bot) {
      throw new Error("Bot not found")
    }

    if (bot.temporary) {
      throw new Error("A temporary member cannot have a Rotina")
    }

    return bot
  }

  function existing(id: string, botId?: string) {
    const routine = input.database.routines.get(id)

    if (!routine || (botId && routine.botId !== botId)) {
      throw new Error("Rotina not found")
    }

    return routine
  }

  function create(rawInput: unknown) {
    const details = parse(routineSchemas.createInput, rawInput)
    const bot = owner(details.botId)
    const now = new Date()
    const routine: Routine = { id: crypto.randomUUID(), ...details, enabled: true, nextCallAt: nextCall(details.frequency, now).toISOString(), createdAt: now.toISOString() }

    return input.observability.span({ name: "routines.create", context: { botId: bot.id } }, () => {
      const created = input.database.routines.create(routine)
      schedule()

      return created
    })
  }

  function update(rawInput: unknown) {
    const { id, ...changes } = parse(routineSchemas.updateInput, rawInput)
    const routine = existing(id)

    return input.observability.span({ name: "routines.update", context: { botId: routine.botId } }, () => {
      const updated = input.database.routines.update(routine.id, { ...changes, nextCallAt: nextCall(changes.frequency, new Date()).toISOString() })

      if (!updated) {
        throw new Error("Rotina not found")
      }

      schedule()

      return updated
    })
  }

  function remove(rawInput: unknown) {
    const { id } = parse(routineSchemas.idInput, rawInput)
    const routine = existing(id)

    input.observability.span({ name: "routines.remove", context: { botId: routine.botId } }, () => {
      input.database.routines.remove(routine.id)
      schedule()
    })
  }

  schedule()

  return {
    create,
    update,
    remove,
    list(rawInput: unknown) {
      const { botId } = parse(routineSchemas.botInput, rawInput)

      return input.database.routines.listForBot(botId)
    },
    tools(bot: Pick<Bot, "id" | "temporary">): PiCustomTool[] {
      if (bot.temporary) {
        return []
      }

      return [{
        name: "routine",
        description: "Create or change one of your Rotinas: a message Jolt sends you on a schedule. Give an id to change an existing Rotina; omit it to create one. A Rotina repeats every N minutes, repeats on chosen weekdays at a local time, or runs once and is then removed by itself.",
        parameters: {
          "id?": "Id of the Rotina to change. Omit to create a new one.",
          "content?": "The message you receive at each call: what you must check or do. Required to create; omit to keep the current one.",
          "everyMinutes?": "Interval in minutes, for a Rotina that repeats every N minutes.",
          "days?": "Comma-separated weekdays in English, for a fixed-time Rotina. Example: \"monday, friday\".",
          "time?": "Local time as HH:MM, for a fixed-time Rotina. Example: \"09:00\".",
          "inMinutes?": "Minutes from now, for a Rotina that runs once. Example: \"5\".",
          "at?": "Local time for a Rotina that runs once: \"HH:MM\" for the next such time, or \"YYYY-MM-DD HH:MM\".",
          "enabled?": "\"no\" to pause the Rotina, \"yes\" to resume it. Defaults to yes.",
        },
        async execute(params) {
          const current = params.id ? existing(params.id, bot.id) : undefined
          const frequency = frequencyFrom(params, current)
          const enabled = params.enabled ? params.enabled !== "no" : current?.enabled ?? true
          const content = params.content?.trim() || current?.content

          if (!content) {
            throw new Error("Give content: the message you receive at each call")
          }

          const routine = current
            ? update({ id: current.id, content, frequency, enabled })
            : create({ botId: bot.id, content, frequency })

          return `Rotina ${routine.id} ${current ? "changed" : "created"}: "${routine.content}", ${describeFrequency(routine.frequency)}${routine.enabled ? "" : ", paused"}. Next call at ${routine.nextCallAt}.`
        },
      }, {
        name: "remove_routine",
        description: "Remove one of your Rotinas for good.",
        parameters: { id: "Id of the Rotina to remove" },
        async execute(params) {
          const routine = existing(params.id ?? "", bot.id)
          remove({ id: routine.id })

          return `Rotina "${routine.content}" removed.`
        },
      }]
    },
    instructions(bot: Pick<Bot, "id" | "temporary">) {
      if (bot.temporary) {
        return ""
      }

      const routines = input.database.routines.listForBot(bot.id)
      const lines = routines.map((routine) => `- ${routine.id}: "${routine.content}", ${describeFrequency(routine.frequency)}${routine.enabled ? "" : ", paused"}`)

      return [
        "A turn with cause \"routine\" is a scheduled call from one of your Rotinas, not from the person. Do what it asks and reply briefly; say \"nothing new\" when there is nothing to report.",
        "Use the routine tool when the person asks you to check or do something on a schedule, to change how often you do it, or to be reminded or called once at a later time. A Rotina that runs once is removed by itself after its call. Use remove_routine to stop a repeating one for good.",
        ...(lines.length > 0 ? ["Your Rotinas:", ...lines] : ["You have no Rotinas."]),
      ].join("\n")
    },
    dispose() {
      clearTimeout(timer)
    },
  }
}
