import { Database } from "bun:sqlite"
import { triggerSchemas, type ExternalEvent } from "@src/shared/triggers"
import { parse } from "@src/shared/parse"
import type { RelaySecrets } from "./relay-secrets"

interface ConnectionRow {
  id: string
  state: string
  connection_token_hash: string
  status: "pending" | "connected"
  installation_id: string | null
  account_login: string | null
  relay_token_hash: string | null
  relay_token_sealed: string | null
  created_at: string
  authorization_verifier: string | null
  authorization_verified: number
}

interface DeliveryRow { cursor: number; payload: string }

const maximumPendingConnections = 1_000

export function openRelayDatabase(path: string, secrets: RelaySecrets) {
  const database = new Database(path, { create: true })
  database.run("PRAGMA journal_mode = WAL")
  database.run("PRAGMA foreign_keys = ON")
  database.run(`CREATE TABLE IF NOT EXISTS connections (
    id TEXT PRIMARY KEY,
    state TEXT NOT NULL UNIQUE,
    connection_token_hash TEXT NOT NULL,
    status TEXT NOT NULL,
    installation_id TEXT,
    account_login TEXT,
    relay_token_hash TEXT,
    relay_token_sealed TEXT,
    created_at TEXT NOT NULL
  )`)
  database.run(`CREATE TABLE IF NOT EXISTS deliveries (
    cursor INTEGER PRIMARY KEY AUTOINCREMENT,
    delivery_id TEXT NOT NULL UNIQUE,
    installation_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    received_at TEXT NOT NULL
  )`)
  database.run("CREATE INDEX IF NOT EXISTS deliveries_installation_cursor ON deliveries (installation_id, cursor)")
  const columns = database.query<{ name: string }, []>("PRAGMA table_info(connections)").all()

  if (!columns.some((column) => column.name === "authorization_verified")) {
    database.transaction(() => {
      database.run("ALTER TABLE connections ADD COLUMN authorization_verified INTEGER NOT NULL DEFAULT 0")
      database.run("ALTER TABLE connections ADD COLUMN authorization_verifier TEXT")
    })()
  }

  const createConnectionStatement = database.prepare("INSERT INTO connections (id, state, connection_token_hash, status, created_at) VALUES (?, ?, ?, 'pending', ?)")
  const connectionByIdStatement = database.prepare<ConnectionRow, [string]>("SELECT * FROM connections WHERE id = ?")
  const connectionByStateStatement = database.prepare<ConnectionRow, [string]>("SELECT * FROM connections WHERE state = ?")
  const beginAuthorizationStatement = database.prepare("UPDATE connections SET state = ?, installation_id = ?, authorization_verifier = ?, created_at = ? WHERE id = ? AND status = 'pending'")
  const completeConnectionStatement = database.prepare("UPDATE connections SET status = 'connected', installation_id = ?, account_login = ?, relay_token_hash = ?, relay_token_sealed = ?, authorization_verified = 1, authorization_verifier = NULL WHERE id = ? AND status = 'pending'")
  const authorizeInstallationStatement = database.prepare<ConnectionRow, [string, string]>("SELECT * FROM connections WHERE installation_id = ? AND relay_token_hash = ? AND status = 'connected' AND authorization_verified = 1 ORDER BY created_at DESC LIMIT 1")
  const deliveriesStatement = database.prepare<DeliveryRow, [string, number, string]>("SELECT cursor, payload FROM deliveries WHERE installation_id = ? AND cursor > ? AND received_at >= ? ORDER BY cursor LIMIT 100")
  const saveDeliveryStatement = database.prepare("INSERT OR IGNORE INTO deliveries (delivery_id, installation_id, payload, received_at) VALUES (?, ?, ?, ?)")
  const deleteExpiredDeliveriesStatement = database.prepare("DELETE FROM deliveries WHERE julianday(received_at) < julianday('now', '-7 days')")
  const deleteExpiredConnectionsStatement = database.prepare("DELETE FROM connections WHERE status = 'pending' AND julianday(created_at) <= julianday('now', '-10 minutes')")
  const revokeConnectionStatement = database.prepare("DELETE FROM connections WHERE installation_id = ? AND relay_token_hash = ?")
  const pendingConnectionsStatement = database.prepare<{ count: number }, []>("SELECT count(*) AS count FROM connections WHERE status = 'pending'")

  function clean() {
    deleteExpiredDeliveriesStatement.run()
    deleteExpiredConnectionsStatement.run()
  }

  function authorizedConnection(installationId: string, token: string) {
    const connection = authorizeInstallationStatement.get(installationId, secrets.hash(token))

    if (!connection) {
      throw new Error("Unauthorized")
    }

    return connection
  }

  function pending(state: string) {
    const connection = connectionByStateStatement.get(state)

    if (connection?.status !== "pending" || Date.parse(connection.created_at) + 10 * 60_000 <= Date.now()) {
      throw new Error("Unauthorized")
    }

    return connection
  }

  return {
    pending(state: string) {
      pending(state)
    },
    createConnection() {
      clean()

      if ((pendingConnectionsStatement.get()?.count ?? 0) >= maximumPendingConnections) {
        return
      }

      const connection = { id: crypto.randomUUID(), state: secrets.issue(), token: secrets.issue(), createdAt: new Date().toISOString() }
      createConnectionStatement.run(connection.id, connection.state, secrets.hash(connection.token), connection.createdAt)

      return connection
    },
    connection(id: string, token: string) {
      const connection = connectionByIdStatement.get(id)

      if (!connection || connection.connection_token_hash !== secrets.hash(token)) {
        throw new Error("Unauthorized")
      }

      if (connection.status === "pending") {
        return { status: "pending" as const }
      }

      if (!connection.authorization_verified) {
        throw new Error("Unauthorized")
      }

      if (!connection.installation_id || !connection.account_login || !connection.relay_token_sealed) {
        throw new Error("Connected record is incomplete")
      }

      return { status: "connected" as const, installationId: connection.installation_id, accountLogin: connection.account_login, relayToken: secrets.open(connection.relay_token_sealed) }
    },
    beginAuthorization(state: string, installationId: string) {
      const connection = pending(state)
      const authorization = { state: secrets.issue(), verifier: secrets.issue() }
      beginAuthorizationStatement.run(authorization.state, installationId, secrets.seal(authorization.verifier), new Date().toISOString(), connection.id)

      return authorization
    },
    authorization(state: string) {
      const connection = pending(state)

      if (!connection.installation_id || !connection.authorization_verifier) {
        throw new Error("Unauthorized")
      }

      return { installationId: connection.installation_id, verifier: secrets.open(connection.authorization_verifier) }
    },
    complete(state: string, installationId: string, accountLogin: string) {
      const connection = pending(state)

      if (connection.installation_id !== installationId || !connection.authorization_verifier) {
        throw new Error("Unauthorized")
      }

      const relayToken = secrets.issue()
      completeConnectionStatement.run(installationId, accountLogin, secrets.hash(relayToken), secrets.seal(relayToken), connection.id)
    },
    authorize(installationId: string, token: string) {
      return authorizedConnection(installationId, token)
    },
    revoke(installationId: string, token: string) {
      revokeConnectionStatement.run(installationId, secrets.hash(token))
    },
    events(installationId: string, token: string, after: number) {
      const connection = authorizedConnection(installationId, token)
      const rows = deliveriesStatement.all(installationId, after, connection.created_at)

      return {
        events: rows.map((row) => parse(triggerSchemas.externalEvent, JSON.parse(row.payload))),
        cursor: String(rows.at(-1)?.cursor ?? after),
      }
    },
    save(event: ExternalEvent) {
      saveDeliveryStatement.run(event.deliveryId, event.installationId, JSON.stringify(event), new Date().toISOString())
    },
    clean() {
      clean()
    },
    close() {
      database.close()
    },
  }
}

export type RelayDatabase = ReturnType<typeof openRelayDatabase>
