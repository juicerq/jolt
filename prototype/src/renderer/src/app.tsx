import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { createPrototypeClient, type PrototypeClient } from "./prototype-client"

const buttonClassName =
  "cursor-pointer rounded-lg bg-orange-400 px-4 py-2.5 font-bold text-stone-900 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-stone-300 disabled:cursor-wait disabled:opacity-60"

export function App() {
  const [client, setClient] = useState<PrototypeClient>()

  useEffect(() => {
    window.prototypeHost.getConnection().then((connection) => {
      setClient(createPrototypeClient(connection))
    })
  }, [])

  if (!client) {
    return (
      <main className="mx-auto max-w-[760px] px-8 py-18 font-sans text-stone-200">
        Waiting for Bun engine…
      </main>
    )
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
    <main className="mx-auto max-w-[760px] px-8 py-18 font-sans text-stone-200">
      <p className="my-[1em] text-xs font-bold tracking-[0.12em] text-orange-400 uppercase">
        Throwaway technical prototype
      </p>
      <h1 className="mt-2 mb-6 max-w-[680px] text-[52px] leading-[1.05] font-bold tracking-[-0.04em]">
        Electron supervises a Bun engine
      </h1>
      {pending && <p className="my-[1em]">Reading engine state…</p>}
      {error && <p className="my-[1em] text-red-300">{error.message}</p>}
      {health && counter && (
        <section className="rounded-2xl border border-stone-800 bg-stone-900 p-6">
          <dl className="mb-6 grid gap-4">
            <div className="grid grid-cols-[160px_1fr] gap-4"><dt className="text-stone-400">Runtime</dt><dd className="m-0 [overflow-wrap:anywhere]">{health.runtime}</dd></div>
            <div className="grid grid-cols-[160px_1fr] gap-4"><dt className="text-stone-400">Process</dt><dd className="m-0 [overflow-wrap:anywhere]">{health.pid}</dd></div>
            <div className="grid grid-cols-[160px_1fr] gap-4"><dt className="text-stone-400">Started</dt><dd className="m-0 [overflow-wrap:anywhere]">{health.startedAt}</dd></div>
            <div className="grid grid-cols-[160px_1fr] gap-4"><dt className="text-stone-400">Scratch database</dt><dd className="m-0 [overflow-wrap:anywhere]">{health.databasePath}</dd></div>
            <div className="grid grid-cols-[160px_1fr] gap-4"><dt className="text-stone-400">Persisted counter</dt><dd className="m-0 [overflow-wrap:anywhere]">{counter.value}</dd></div>
            <div className="grid grid-cols-[160px_1fr] gap-4"><dt className="text-stone-400">Last write</dt><dd className="m-0 [overflow-wrap:anywhere]">{counter.updatedAt}</dd></div>
          </dl>
          <button className={buttonClassName} disabled={incrementPending} onClick={() => increment({})}>
            {incrementPending ? "Writing…" : "Write through Drizzle"}
          </button>
          <h2 className="mt-8 mb-3 text-lg font-bold">oRPC event iterator</h2>
          <ol className="my-[1em] list-decimal pl-5">
            {events.map((event) => <li key={event.sequence}>{event.sequence}. {event.message}</li>)}
          </ol>
          <h2 className="mt-8 mb-3 text-lg font-bold">Read-only provider probes</h2>
          <div className="flex gap-3">
            <button className={buttonClassName} disabled={codexPending} onClick={() => probeCodex({})}>{codexPending ? "Probing Codex…" : "Probe Codex"}</button>
            <button className={buttonClassName} disabled={claudePending} onClick={() => probeClaude({})}>{claudePending ? "Probing Claude…" : "Probe Claude"}</button>
          </div>
          {codexError && <p className="my-[1em] text-red-300">Codex: {codexError.message}</p>}
          {claudeError && <p className="my-[1em] text-red-300">Claude: {claudeError.message}</p>}
          {codex && <pre className="my-[1em] overflow-auto rounded-lg bg-stone-950 p-4">{JSON.stringify(codex, null, 2)}</pre>}
          {claude && <pre className="my-[1em] overflow-auto rounded-lg bg-stone-950 p-4">{JSON.stringify(claude, null, 2)}</pre>}
        </section>
      )}
    </main>
  )
}
