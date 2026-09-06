import { useQuery } from "@tanstack/react-query"
import { openCreateBot } from "../bots/bots-store"
import type { EngineClient } from "../engine-client"
import { Button } from "../ui/button"
import { ProviderConnections } from "./provider-connections"

export function ProviderWelcome({ client }: { client: EngineClient }) {
  const { data: providers } = useQuery(client.query.providers.list.queryOptions())
  const connected = providers?.some((provider) => provider.status === "available") ?? false

  return (
    <section className="flex h-full min-h-0 flex-col overflow-y-auto" aria-label="Boas-vindas ao Jolt">
      <div className="m-auto flex w-[min(560px,calc(100%-48px))] flex-col gap-8 py-12">
        <header>
          <p className="m-0 mb-3 text-label text-muted uppercase">Bem-vindo ao Jolt</p>
          <h1 className="m-0 text-title font-semibold text-primary">Crie seu primeiro Bot</h1>
          <p className="m-0 mt-3 text-body font-normal text-secondary">Conecte uma conta do ChatGPT ou do OpenCode Go para começar.</p>
        </header>
        <ProviderConnections client={client} />
        <div className="flex flex-col items-start gap-3">
          <Button type="button" disabled={!connected} onClick={openCreateBot}>Criar um Bot</Button>
          {connected && <p className="m-0 text-support font-normal text-secondary">Você pode alterar a conexão depois nas Configurações.</p>}
        </div>
      </div>
    </section>
  )
}
