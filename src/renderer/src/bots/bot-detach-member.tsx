import { LinkSlashIcon } from "@heroicons/react/24/outline"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import type { Bot } from "@src/shared/bots"
import type { EngineClient } from "../engine-client"
import { Button } from "../ui/button"
import { ConfirmationDialog } from "../ui/dialog"
import { SettingsSection } from "../ui/settings-section"

export function BotDetachMember({ bot, leader, client }: { bot: Bot; leader: Bot; client: EngineClient }) {
  const [confirming, setConfirming] = useState(false)
  const queryClient = useQueryClient()
  const { mutate: detach, isPending, error, reset } = useMutation(client.query.bots.detachMember.mutationOptions({
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: client.query.projects.key() })
    },
  }))

  if (bot.temporary) {
    return null
  }

  return (
    <SettingsSection title="Vínculo com o time">
      <p className="m-0 text-support text-secondary">{bot.name} pode voltar a ser um Bot independente.</p>
      <Button className="self-start" variant="secondary" type="button" onClick={() => { reset(); setConfirming(true) }}>Desvincular do time</Button>
      {confirming && (
        <ConfirmationDialog
          icon={<LinkSlashIcon />}
          title="Desvincular do time"
          onClose={() => { if (!isPending) { setConfirming(false) } }}
          actions={<>
            <Button variant="text" type="button" autoFocus disabled={isPending} onClick={() => setConfirming(false)}>Cancelar</Button>
            <Button type="button" disabled={isPending} onClick={() => detach({ id: bot.id })}>{isPending ? "Desvinculando..." : "Desvincular"}</Button>
          </>}
        >
          <p className="m-0 text-control text-secondary">{bot.name} sairá do time de {leader.name}. Mantém o Projeto, a pasta, a conversa, a Função, a Memória própria, os Colegas e os acessos. Deixa de ler a Memória do Líder.</p>
          <p className="m-0 text-support text-secondary">Você pode adicioná-lo a um time novamente depois.</p>
          {error && <p className="m-0 text-support text-status-error" role="alert">Não foi possível desvincular: {error.message}</p>}
        </ConfirmationDialog>
      )}
    </SettingsSection>
  )
}
