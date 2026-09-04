# GitHub relay

O relay recebe webhooks e entrega eventos e tokens de instalação ao Jolt. Para conectar uma instalação inteira, a pessoa precisa autorizar o GitHub App e comprovar que é dona da conta pessoal ou administradora da organização.

## Configuração do GitHub App

- Setup URL: `https://joltgithub.duckdns.org/github/setup`
- Callback URL: `https://joltgithub.duckdns.org/github/authorize`
- Webhook URL: `https://joltgithub.duckdns.org/github/webhook`
- Para organizações: permissão de organização `Members: read`.

O fluxo inicia na instalação e pede autorização OAuth depois do setup. Não habilite a opção de pedir autorização OAuth durante a instalação: este relay controla essa etapa depois do setup, com estado próprio e PKCE.

O Client ID é diferente do App ID. Configure `GITHUB_APP_CLIENT_ID` e `GITHUB_APP_CLIENT_SECRET` no ambiente do relay. O client secret fica apenas na VPS. A chave privada do App continua necessária para emitir tokens da instalação.

Sem o par OAuth, o relay recebe webhooks, mas rejeita novas conexões com HTTP 503 e informa `needs-configuration` em `/health`. Configurar apenas um dos dois valores impede o boot.

## Conexões e recuperação

O callback OAuth expira após dez minutos e só pode concluir uma conexão uma vez. O relay rejeita credenciais criadas antes da verificação de ownership; essas Contas precisam ser reconectadas.

Desconectar uma Conta revoga sua credencial no relay antes de apagá-la no Jolt. Tokens de instalação já emitidos pelo GitHub continuam válidos até a expiração informada pelo GitHub.

Gatilhos conferem o Acesso do Bot na ingestão e antes de iniciar um Disparo. Após um crash, um Disparo que já tem mensagem persistida termina como falho; apenas um Disparo que ainda não iniciou o Turno volta à fila.

O relay limita tentativas por origem e mantém no máximo 1.000 conexões pendentes, descartadas após dez minutos. Ele deve escutar em loopback atrás de um proxy que sobrescreva `X-Forwarded-For`, como o Caddy configurado na VPS. Não exponha a porta do Bun diretamente à internet.
