# GitHub relay

O relay recebe webhooks e entrega eventos e tokens de instalação ao Jolt. Para conectar uma instalação inteira, a pessoa precisa autorizar o GitHub App e comprovar que é dona da conta pessoal ou administradora da organização.

## Configuração do GitHub App

- Setup URL: `https://joltgithub.duckdns.org/github/setup`
- Callback URL: `https://joltgithub.duckdns.org/github/authorize`
- Webhook URL: `https://joltgithub.duckdns.org/github/webhook`
- Para organizações: permissão de organização `Members: read`.

O fluxo começa no OAuth do GitHub. Depois do login, o relay lista as instalações que a pessoa pode administrar e oferece instalar em outra conta ou organização, mesmo quando só existe uma instalação. Isso permite conectar uma organização sem ficar preso à instalação pessoal existente. Sem instalações disponíveis, o relay abre a instalação do App e aproveita o login no retorno, sem pedir nickname nem repetir OAuth. Não habilite a opção de pedir autorização OAuth durante a instalação: o relay controla a autorização com estado próprio e PKCE.

Quando `POST /v1/connections` recebe `target` no formato `owner/repository`, o alvo acompanha o estado OAuth no banco. O relay usa a instalação do proprietário indicado, verifica o repositório na lista acessível à instalação e só então conclui a conexão. Sem acesso, a página oferece autorizar no GitHub e verifica novamente a cada 10 segundos enquanto estiver aberta, dentro da validade de 10 minutos da tentativa. Uma solicitação de aprovação da organização permanece pendente e informa esse estado ao Jolt. A tela antiga de seleção continua disponível para conexões sem alvo, inclusive clientes já distribuídos.

A listagem percorre a paginação do GitHub e exclui instalações suspensas, contas de terceiros e organizações onde a pessoa não é administradora ativa. A escolha e o retorno da instalação confirmam novamente o ownership antes de liberar acesso.

O Client ID é diferente do App ID. Configure `GITHUB_APP_CLIENT_ID` e `GITHUB_APP_CLIENT_SECRET` no ambiente do relay. O client secret fica apenas na VPS. A chave privada do App continua necessária para emitir tokens da instalação.

Sem o par OAuth, o relay recebe webhooks, mas rejeita novas conexões com HTTP 503 e informa `needs-configuration` em `/health`. Configurar apenas um dos dois valores impede o boot.

## Conexões e recuperação

A tentativa expira após dez minutos. O callback OAuth só pode ser consumido uma vez e troca o estado antes da seleção. O token de usuário fica cifrado na VPS durante a tentativa e é apagado ao concluir a conexão. Cancelamento e expiração encerram a espera do Jolt. O relay rejeita credenciais criadas antes da verificação de ownership; essas Contas precisam ser reconectadas.

Reconectar a mesma instalação no mesmo relay renova a Conta local, revoga a credencial anterior e preserva seus Acessos, sem criar outra Conta.

Desconectar uma Conta revoga sua credencial no relay antes de apagá-la no Jolt. Tokens de instalação já emitidos pelo GitHub continuam válidos até a expiração informada pelo GitHub.

Gatilhos conferem o Acesso do Bot na ingestão e antes de iniciar um Disparo. Após um crash, um Disparo que já tem mensagem persistida termina como falho; apenas um Disparo que ainda não iniciou o Turno volta à fila.

O relay limita tentativas por origem e mantém no máximo 1.000 conexões pendentes, descartadas após dez minutos. Ele deve escutar em loopback atrás de um proxy que sobrescreva `X-Forwarded-For`, como o Caddy configurado na VPS. Não exponha a porta do Bun diretamente à internet.
