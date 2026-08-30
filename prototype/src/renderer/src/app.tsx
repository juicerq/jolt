import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { createPrototypeClient, type PrototypeClient } from "./prototype-client"

export function App() {
  const [client, setClient] = useState<PrototypeClient>()

  useEffect(() => {
    window.prototypeHost.getConnection().then((connection) => {
      setClient(createPrototypeClient(connection))
    })
  }, [])

  if (!client) {
    return <main>Waiting for Bun engine…</main>
  }

  return <PrototypeStatus client={client} />
}

function PrototypeStatus({ client }: { client: PrototypeClient }) {
  const queryClient = useQueryClient()
  const [events, setEvents] = useState<{ sequence: number; message: string; emittedAt: string }[]>([])
  const { data: health, isPending: healthPending, error: healthError } = useQuery(client.health.queryOptions())
  const { data: counter, isPending: counterPending, error: counterError } = useQuery(client.counter.read.queryOptions())
  const { mutate: increment, isPending: incrementPending } = useMutation(
    client.counter.increment.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: client.counter.read.queryKey() })
      },
    }),
  )
  const { mutate: probeCodex, data: codex, isPending: codexPending, error: codexError } = useMutation(client.probes.codex.mutationOptions())
  const { mutate: probeClaude, data: claude, isPending: claudePending, error: claudeError } = useMutation(client.probes.claude.mutationOptions())

  useEffect(() => {
    let active = true

    async function consumeEvents() {
      const stream = await client.events.call()

      for await (const event of stream) {
        if (!active) {
          return
        }

        setEvents((current) => [...current, event])
      }
    }

    consumeEvents().catch((streamError) => {
      if (active) {
        setEvents([{ sequence: 1, message: `Stream failed: ${String(streamError)}`, emittedAt: new Date().toISOString() }])
      }
    })

    return () => {
      active = false
    }
  }, [client])

  const pending = healthPending || counterPending
  const error = healthError ?? counterError

  return (
    <main>
      <p className="eyebrow">Throwaway technical prototype</p>
      <h1>Electron supervises a Bun engine</h1>
      {pending && <p>Reading engine state…</p>}
      {error && <p className="error">{error.message}</p>}
      {health && counter && (
        <section>
          <dl>
            <div><dt>Runtime</dt><dd>{health.runtime}</dd></div>
            <div><dt>Process</dt><dd>{health.pid}</dd></div>
            <div><dt>Started</dt><dd>{health.startedAt}</dd></div>
            <div><dt>Scratch database</dt><dd>{health.databasePath}</dd></div>
            <div><dt>Persisted counter</dt><dd>{counter.value}</dd></div>
            <div><dt>Last write</dt><dd>{counter.updatedAt}</dd></div>
          </dl>
          <button disabled={incrementPending} onClick={() => increment({})}>
            {incrementPending ? "Writing…" : "Write through Drizzle"}
          </button>
          <h2>oRPC event iterator</h2>
          <ol>
            {events.map((event) => <li key={event.sequence}>{event.sequence}. {event.message}</li>)}
          </ol>
          <h2>Read-only provider probes</h2>
          <div className="actions">
            <button disabled={codexPending} onClick={() => probeCodex({})}>{codexPending ? "Probing Codex…" : "Probe Codex"}</button>
            <button disabled={claudePending} onClick={() => probeClaude({})}>{claudePending ? "Probing Claude…" : "Probe Claude"}</button>
          </div>
          {codexError && <p className="error">Codex: {codexError.message}</p>}
          {claudeError && <p className="error">Claude: {claudeError.message}</p>}
          {codex && <pre>{JSON.stringify(codex, null, 2)}</pre>}
          {claude && <pre>{JSON.stringify(claude, null, 2)}</pre>}
        </section>
      )}
    </main>
  )
}
