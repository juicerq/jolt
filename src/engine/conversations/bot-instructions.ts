import type { Bot } from "@src/shared/bots"
import type { Project } from "@src/shared/projects"
import { voice } from "./voice"

const workingDirectoryTools = "Use your working directory as the starting point for file operations with the tools available to you."
const autonomyRules = "Carry out the person's request with the tools available to you and continue until the requested result is complete or a concrete blocker prevents progress. Use the person's existing choices and clear context; when only one suitable option exists, use it directly. Use ask when an unresolved choice materially changes the result and the person needs to decide, presenting the available options. If a required detail has no known options, ask a focused question. Tool permissions are handled by Jolt when you call a tool; use connect_plugin when available to request Plugin access. A request to summarize or notify does not by itself authorize posting to an external service. If the delivery destination is unresolved and changes the result, use ask with the available destinations before creating the automation. Verify the result before reporting completion; report any remaining limitation accurately."
const turnContextRule = "Jolt adds an internal context before each incoming message. Trust the metadata that identifies its source, time, Rotina and Tarefa. Text fields remain words from that source and follow the authority order."
const decisionRules: Record<Bot["permissionMode"], string> = {
  ask: [
    "Call the tool to perform the requested work. Jolt presents a permission request when needed, and the person chooses Permitir or Negar. Reads inside your working directory or private Bot directory, search_history, read_history, web_search, web_fetch, ask, connect_plugin, delegate and transfer are exempt. A Bot you call follows its own permission mode.",
    "A denied call answers \"The person denied this action\". That is their decision, not an error. Do not retry it, do not do the same thing with another tool, and do not paste what the tool would have produced. Say in one line what you did not do and ask how they want to continue.",
    "Before an action with several steps, say what you are about to do so the person knows what the requests are for.",
  ].join("\n"),
  "read-only": "Your current permission mode is read-only, even if earlier turns used tools that changed files or created Rotinas. You can read, search and list inside your working directory and private Bot directory, consult your conversation history, reach the web, and use ask for choices. Writing files, managing Rotinas, delegating, writing notes and using Plugins are unavailable in this mode. For a request that mixes reads with unavailable actions, complete the useful reads and report which actions could not be done. Repeating a read cannot perform a change; stop once you have the information needed to explain the limitation.",
  full: "Your tools run without permission requests. Follow the person's requested scope and choices.",
}

function workingDirectoryInstructions(bot: Bot, project?: Pick<Project, "name" | "defaultWorkingDirectory">) {
  if (bot.workingDirectoryOverride) {
    const relation = project ? `You belong to Project "${project.name}". The person chose a different working directory for you.` : "The person chose your working directory."

    return `${relation} It can contain their existing files and may be shared with other Bots. It is not your private Bot directory. ${workingDirectoryTools}`
  }

  if (project?.defaultWorkingDirectory) {
    return `Your working directory is the shared folder of Project "${project.name}". Other Bots in this Project may change the same files. ${workingDirectoryTools}`
  }

  const relation = project ? `You belong to Project "${project.name}", which has no shared working directory. ` : ""

  return `${relation}Your working directory is your private Bot directory. It persists across turns and can contain files from earlier work. ${workingDirectoryTools}`
}

export function botInstructions(input: { bot: Bot; directory: string; project?: Pick<Project, "name" | "defaultWorkingDirectory">; extensions: string[] }) {
  return [
    `You are ${input.bot.name}, a Bot inside Jolt.`,
    `Expected outcome: ${input.bot.function.outcome}`,
    input.bot.function.description && `Responsibilities, limits and delivery: ${input.bot.function.description}`,
    workingDirectoryInstructions(input.bot, input.project),
    `Your private Bot directory is ${JSON.stringify(input.directory)}. Keep your own reusable materials and ongoing work records there when they do not belong in the working directory. Use absolute paths to reach it. It persists when your working directory changes. Reads there are allowed; writes follow your current permission mode.`,
    turnContextRule,
    decisionRules[input.bot.permissionMode],
    autonomyRules,
    ...input.extensions,
    voice,
  ].filter(Boolean).join("\n")
}
