import { Database } from "bun:sqlite"
import { and, asc, eq, inArray, isNull, max, sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/bun-sqlite"
import { migrate } from "drizzle-orm/bun-sqlite/migrator"
import type { SQLiteTable } from "drizzle-orm/sqlite-core"
import type { StoredBot } from "../../shared/bots"
import { botSchemas } from "../../shared/bots"
import type { Project } from "../../shared/projects"
import { projectSchemas } from "../../shared/projects"
import type { Observability } from "../observability/observability"
import { migrations } from "./migrations"
import type { ConversationMessage } from "../../shared/conversations"
import { conversationSchemas } from "../../shared/conversations"
import type { Note, StoredMemory } from "../../shared/memory"
import { memorySchemas } from "../../shared/memory"
import type { Routine } from "../../shared/routines"
import { routineSchemas } from "../../shared/routines"
import type { Task } from "../../shared/tasks"
import { taskSchemas } from "../../shared/tasks"
import { bots, conversations, memories, messages, notes, projects, routines, tasks } from "./schema"

function insertion(table: SQLiteTable) {
  return asc(sql`${table}.rowid`)
}

const messageColumns = {
  id: messages.id,
  botId: messages.botId,
  author: messages.author,
  authorBotId: messages.authorBotId,
  taskId: messages.taskId,
  content: messages.content,
  activity: messages.activity,
  ending: messages.ending,
  createdAt: messages.createdAt,
}

export function openDatabase(path: string, observability: Observability) {
  const sqlite = new Database(path, { create: true })
  const database = drizzle({ client: sqlite })

  sqlite.run("PRAGMA foreign_keys = ON")
  observability.span({ name: "database.migrate" }, () => {
    migrate(database, migrations)
  })

  return {
    projects: {
      create(project: Project) {
        return observability.span({ name: "database.projectcreate", context: { projectId: project.id } }, () => {
          database.insert(projects).values(project).run()

          return project
        })
      },
      list() {
        return observability.span(
          { name: "database.projectlist" },
          () => projectSchemas.projectList.assert(database.select().from(projects).orderBy(asc(projects.createdAt), insertion(projects)).all()),
        )
      },
      get(id: string) {
        return observability.span({ name: "database.projectget", context: { projectId: id } }, () => {
          const row = database.select().from(projects).where(eq(projects.id, id)).get()

          return row ? projectSchemas.project.assert(row) : undefined
        })
      },
    },
    bots: {
      create(bot: StoredBot) {
        return observability.span({ name: "database.botcreate", context: { botId: bot.id, provider: bot.provider, ...(bot.projectId ? { projectId: bot.projectId } : {}) } }, () => {
          database.insert(bots).values(bot).run()
          return bot
        })
      },
      list() {
        return observability.span({ name: "database.botlist" }, () => botSchemas.storedBotList.assert(database.select().from(bots).orderBy(asc(bots.createdAt), insertion(bots)).all()))
      },
      get(id: string) {
        return observability.span({ name: "database.botget", context: { botId: id } }, () => {
          const row = database.select().from(bots).where(eq(bots.id, id)).get()
          return row ? botSchemas.storedBot.assert(row) : undefined
        })
      },
      update(id: string, changes: Pick<StoredBot, "name" | "function" | "projectId" | "workingDirectoryOverride" | "memoryEnabled">) {
        return observability.span({ name: "database.botupdate", context: { botId: id, ...(changes.projectId ? { projectId: changes.projectId } : {}) } }, () => {
          const row = database.transaction((transaction) => {
            const updated = transaction.update(bots).set(changes).where(eq(bots.id, id)).returning().get()

            if (!updated) {
              return undefined
            }

            transaction.update(bots).set({ projectId: changes.projectId }).where(eq(bots.leaderBotId, id)).run()

            return updated
          })

          return row ? botSchemas.storedBot.assert(row) : undefined
        })
      },
      remove(id: string) {
        return observability.span({ name: "database.botremove", context: { botId: id } }, () => database.delete(bots).where(eq(bots.id, id)).run().changes)
      },
    },
    conversations: {
      history(botId: string) {
        return observability.span({ name: "database.conversationhistory", context: { botId } }, () => conversationSchemas.messageList.assert(
          database.select(messageColumns).from(messages).where(eq(messages.botId, botId)).orderBy(asc(messages.position)).all(),
        ))
      },
      related(taskId: string) {
        return observability.span({ name: "database.conversationrelated", context: { taskId } }, () => conversationSchemas.messageList.assert(
          database.select(messageColumns).from(messages).where(eq(messages.taskId, taskId)).orderBy(insertion(messages)).all(),
        ))
      },
      lastMessages() {
        return observability.span({ name: "database.conversationlast" }, () => {
          const lastPositions = database.select({ botId: messages.botId, position: max(messages.position).as("position") }).from(messages).groupBy(messages.botId).as("last")

          return conversationSchemas.messageList.assert(
            database.select(messageColumns).from(messages).innerJoin(lastPositions, and(eq(messages.botId, lastPositions.botId), eq(messages.position, lastPositions.position))).all(),
          )
        })
      },
      append(message: ConversationMessage) {
        return observability.span({ name: "database.messageappend", context: { botId: message.botId } }, () => {
          const lastPosition = database.select({ value: max(messages.position) }).from(messages).where(eq(messages.botId, message.botId)).get()?.value ?? 0
          database.insert(messages).values({ ...message, position: lastPosition + 1 }).run()

          return message
        })
      },
      sessionFile(botId: string) {
        return observability.span({ name: "database.conversationsessionget", context: { botId } }, () => database.select({ sessionFile: conversations.sessionFile }).from(conversations).where(eq(conversations.botId, botId)).get()?.sessionFile ?? undefined)
      },
      saveSessionFile(botId: string, sessionFile: string) {
        return observability.span({ name: "database.conversationsessionsave", context: { botId } }, () => {
          database.insert(conversations).values({ botId, sessionFile }).onConflictDoUpdate({ target: conversations.botId, set: { sessionFile } }).run()
        })
      },
    },
    tasks: {
      create(task: Task) {
        return observability.span({ name: "database.taskcreate", context: { taskId: task.id, leaderBotId: task.leaderBotId, botId: task.assigneeBotId } }, () => {
          database.insert(tasks).values(task).run()

          return task
        })
      },
      get(id: string) {
        return observability.span({ name: "database.taskget", context: { taskId: id } }, () => {
          const row = database.select().from(tasks).where(eq(tasks.id, id)).get()

          return row ? taskSchemas.task.assert(row) : undefined
        })
      },
      update(id: string, changes: Partial<Pick<Task, "assigneeBotId" | "status" | "finishedAt">>) {
        return observability.span({ name: "database.taskupdate", context: { taskId: id } }, () => {
          const row = database.update(tasks).set(changes).where(eq(tasks.id, id)).returning().get()

          return row ? taskSchemas.task.assert(row) : undefined
        })
      },
      interruptWorking(finishedAt: string) {
        return observability.span({ name: "database.taskinterruptworking" }, () => {
          return database.update(tasks).set({ status: "interrupted", finishedAt }).where(eq(tasks.status, "working")).run().changes
        })
      },
      workingAssigneeIds() {
        return observability.span({ name: "database.taskworkingassignees" }, () => new Set(
          database.selectDistinct({ assigneeBotId: tasks.assigneeBotId }).from(tasks).where(eq(tasks.status, "working")).all().map((row) => row.assigneeBotId),
        ))
      },
      listForLeader(leaderBotId: string) {
        return observability.span({ name: "database.tasklist", context: { leaderBotId } }, () => taskSchemas.taskList.assert(
          database.select().from(tasks).where(eq(tasks.leaderBotId, leaderBotId)).orderBy(asc(tasks.createdAt), insertion(tasks)).all(),
        ))
      },
    },
    routines: {
      create(routine: Routine) {
        return observability.span({ name: "database.routinecreate", context: { botId: routine.botId } }, () => {
          database.insert(routines).values(routine).run()

          return routine
        })
      },
      get(id: string) {
        return observability.span({ name: "database.routineget" }, () => {
          const row = database.select().from(routines).where(eq(routines.id, id)).get()

          return row ? routineSchemas.routine.assert(row) : undefined
        })
      },
      listForBot(botId: string) {
        return observability.span({ name: "database.routinelist", context: { botId } }, () => routineSchemas.routineList.assert(
          database.select().from(routines).where(eq(routines.botId, botId)).orderBy(asc(routines.createdAt), insertion(routines)).all(),
        ))
      },
      listEnabled() {
        return observability.span({ name: "database.routinelistenabled" }, () => routineSchemas.routineList.assert(
          database.select().from(routines).where(eq(routines.enabled, true)).orderBy(asc(routines.nextCallAt), insertion(routines)).all(),
        ))
      },
      update(id: string, changes: Partial<Pick<Routine, "content" | "frequency" | "enabled" | "nextCallAt">>) {
        return observability.span({ name: "database.routineupdate" }, () => {
          const row = database.update(routines).set(changes).where(eq(routines.id, id)).returning().get()

          return row ? routineSchemas.routine.assert(row) : undefined
        })
      },
      remove(id: string) {
        return observability.span({ name: "database.routineremove" }, () => database.delete(routines).where(eq(routines.id, id)).run().changes)
      },
    },
    notes: {
      create(note: Note) {
        return observability.span({ name: "database.notecreate", context: { botId: note.botId, ...(note.taskId ? { taskId: note.taskId } : {}) } }, () => {
          database.insert(notes).values(note).run()

          return note
        })
      },
      listPending(botId: string) {
        return observability.span({ name: "database.notelistpending", context: { botId } }, () => memorySchemas.noteList.assert(
          database.select().from(notes).where(and(eq(notes.botId, botId), isNull(notes.curatedAt))).orderBy(asc(notes.createdAt), insertion(notes)).all(),
        ))
      },
      pendingBotIds() {
        return observability.span({ name: "database.notependingbots" }, () => database.selectDistinct({ botId: notes.botId }).from(notes).where(isNull(notes.curatedAt)).all().map((row) => row.botId))
      },
      markCurated(ids: string[], curatedAt: string) {
        return observability.span({ name: "database.notemarkcurated", attributes: { count: ids.length } }, () => {
          if (ids.length === 0) {
            return 0
          }

          return database.update(notes).set({ curatedAt }).where(inArray(notes.id, ids)).run().changes
        })
      },
      removeForBot(botId: string) {
        return observability.span({ name: "database.noteremoveforbot", context: { botId } }, () => database.delete(notes).where(eq(notes.botId, botId)).run().changes)
      },
    },
    memories: {
      create(memory: StoredMemory) {
        return observability.span({ name: "database.memorycreate", context: { botId: memory.botId } }, () => {
          database.insert(memories).values(memory).run()

          return memory
        })
      },
      get(id: string) {
        return observability.span({ name: "database.memoryget" }, () => {
          const row = database.select().from(memories).where(eq(memories.id, id)).get()

          return row ? memorySchemas.storedMemory.assert(row) : undefined
        })
      },
      listForBot(botId: string) {
        return observability.span({ name: "database.memorylist", context: { botId } }, () => memorySchemas.memoryList.assert(
          database
            .select({ id: memories.id, botId: memories.botId, content: memories.content, origin: memories.origin, createdAt: memories.createdAt, turnAuthor: notes.turnAuthor })
            .from(memories)
            .leftJoin(notes, eq(notes.id, memories.noteId))
            .where(eq(memories.botId, botId))
            .orderBy(asc(memories.createdAt), insertion(memories))
            .all(),
        ))
      },
      update(id: string, changes: Pick<StoredMemory, "content">) {
        return observability.span({ name: "database.memoryupdate" }, () => {
          const row = database.update(memories).set(changes).where(eq(memories.id, id)).returning().get()

          return row ? memorySchemas.storedMemory.assert(row) : undefined
        })
      },
      remove(id: string) {
        return observability.span({ name: "database.memoryremove" }, () => database.delete(memories).where(eq(memories.id, id)).run().changes)
      },
      removeForBot(botId: string) {
        return observability.span({ name: "database.memoryremoveforbot", context: { botId } }, () => database.delete(memories).where(eq(memories.botId, botId)).run().changes)
      },
    },
    migrationState() {
      return observability.span({ name: "database.transaction" }, () => database.all<{ name: string }>(sql`SELECT name FROM __drizzle_migrations ORDER BY id`).map((entry) => entry.name))
    },
    close() {
      sqlite.close()
    },
  }
}

export type AppDatabase = ReturnType<typeof openDatabase>
