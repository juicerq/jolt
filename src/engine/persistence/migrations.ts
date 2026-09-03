import type { MigrationsJournal } from "drizzle-orm/migrator"
import initialSchema from "../../../drizzle/20260901132949_initial-schema/migration.sql" with { type: "text" }
import routines from "../../../drizzle/20260901184631_routines/migration.sql" with { type: "text" }
import memory from "../../../drizzle/20260901200730_memory/migration.sql" with { type: "text" }
import messageImages from "../../../drizzle/20260901224322_message-images/migration.sql" with { type: "text" }
import botEffort from "../../../drizzle/20260901225418_bot-effort/migration.sql" with { type: "text" }
import botModel from "../../../drizzle/20260901225922_bot-model/migration.sql" with { type: "text" }
import botPermission from "../../../drizzle/20260902153823_bot-permission/migration.sql" with { type: "text" }
import plugins from "../../../drizzle/20260902190240_plugins/migration.sql" with { type: "text" }
import multiAccountAccess from "../../../drizzle/20260902235222_multi-account-access/migration.sql" with { type: "text" }
import whatsappMessages from "../../../drizzle/20260903011817_whatsapp-messages/migration.sql" with { type: "text" }
import whatsappContacts from "../../../drizzle/20260903021111_whatsapp-contacts/migration.sql" with { type: "text" }
import colleagues from "../../../drizzle/20260903112334_colleagues/migration.sql" with { type: "text" }
import botAvatarSeed from "../../../drizzle/20260903142103_burly_maestro/migration.sql" with { type: "text" }
import messageError from "../../../drizzle/20260903145043_thin_greymalkin/migration.sql" with { type: "text" }
import consolidatedRoutines from "../../../drizzle/20260903162419_consolidated-routines/migration.sql" with { type: "text" }
import messageQuestions from "../../../drizzle/20260903210921_bouncy_bedlam/migration.sql" with { type: "text" }

export const migrations = [
  { name: "20260901132949_initial-schema", timestamp: 1788269389000, sql: initialSchema },
  { name: "20260901184631_routines", timestamp: 1788288391000, sql: routines },
  { name: "20260901200730_memory", timestamp: 1788293250000, sql: memory },
  { name: "20260901224322_message-images", timestamp: 1788302602000, sql: messageImages },
  { name: "20260901225418_bot-effort", timestamp: 1788303258000, sql: botEffort },
  { name: "20260901225922_bot-model", timestamp: 1788303562000, sql: botModel },
  { name: "20260902153823_bot-permission", timestamp: 1788374303000, sql: botPermission },
  { name: "20260902190240_plugins", timestamp: 1788375760000, sql: plugins },
  { name: "20260902235222_multi-account-access", timestamp: 1788393142000, sql: multiAccountAccess },
  { name: "20260903011817_whatsapp-messages", timestamp: 1788398297000, sql: whatsappMessages },
  { name: "20260903021111_whatsapp-contacts", timestamp: 1788401471000, sql: whatsappContacts },
  { name: "20260903112334_colleagues", timestamp: 1788434614000, sql: colleagues },
  { name: "20260903142103_burly_maestro", timestamp: 1788445263000, sql: botAvatarSeed },
  { name: "20260903145043_thin_greymalkin", timestamp: 1788447043000, sql: messageError },
  { name: "20260903162419_consolidated-routines", timestamp: 1788459859000, sql: consolidatedRoutines },
  { name: "20260903210921_bouncy_bedlam", timestamp: 1788473361000, sql: messageQuestions },
] satisfies MigrationsJournal
