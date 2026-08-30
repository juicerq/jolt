import { useQuery } from "@tanstack/react-query"
import type { EngineClient } from "./engine-client"

export function App({ client }: { client: EngineClient }) {
  return <EngineHealth client={client} />
}

function EngineHealth({ client }: { client: EngineClient }) {
  const health = useQuery(client.health.queryOptions())

  if (health.error) {
    return <main>Falha ao conectar ao Bun Engine: {health.error.message}</main>
  }

  return <main>{health.data ? `Bun Engine conectado: ${health.data.runtime}` : "Verificando Bun Engine..."}</main>
}
