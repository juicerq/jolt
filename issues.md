# Issues

## local-runtime-foundation

### Outcome

Uma aplicação de produção mínima abre o Electron, inicia um Bun Engine compilado, conecta o Renderer pelo oRPC e abre um banco SQLite por Drizzle com `bun:sqlite`.

### Acceptance criteria

- [ ] O projeto usa versões exatas de Electron, Bun, React, TypeScript e electron-vite.
- [ ] O Electron Main inicia o Bun Engine compilado e valida sua mensagem de prontidão.
- [ ] O Bun Engine escuta somente em loopback e exige um token efêmero.
- [ ] O Renderer consulta a saúde do Bun Engine pelo oRPC.
- [ ] Drizzle aplica a migração inicial por `bun:sqlite`.
- [ ] Encerrar o aplicativo encerra o Bun Engine sem processo órfão.
- [ ] Instalação limpa, typecheck e build passam por comandos Bun documentados.

### Blocked by

None.

### Context

Recriar somente os comportamentos validados em `prototype/`; não copiar sua estrutura descartável. Usar o Skill tool com name `code-practices`, o Skill tool com name `codebase-design`, o Skill tool com name `external-integration`, o Skill tool com name `arktype` e o Skill tool com name `testing-with-tdd`.

### Addresses

`Stack`, `Arquitetura do Electron`, `Organização do código` e `Veredito do protótipo do Bun Engine` em `spec.md`.

## local-observability

### Outcome

Renderer, Electron Main e Bun Engine produzem Observations correlacionadas, locais e sem conteúdo sensível, com uma tela que mostra falhas e durações recentes.

### Acceptance criteria

- [ ] `Observability` expõe somente `event`, `span` e `flush`.
- [ ] Events e Spans usam um envelope validado e nomes estáveis.
- [ ] `traceId`, `spanId` e `parentSpanId` atravessam oRPC, Drizzle e subprocesso em teste.
- [ ] JSONL com rotação, console de desenvolvimento e buffer recente satisfazem a mesma interface de saída.
- [ ] A lista permitida impede conteúdo, ambiente, headers e segredos.
- [ ] Falhas de gravação não interrompem o produto e aparecem em `stderr`.
- [ ] A tela mostra processos, versões, falhas, p50, p95, máximo e operações lentas.
- [ ] A exportação diagnóstica contém apenas Observations e metadados não sensíveis.
- [ ] Testes provam propagação, medição, rotação, normalização de erros e rejeição de atributos proibidos.

### Blocked by

`local-runtime-foundation`.

### Context

Não adicionar OpenTelemetry nem banco de métricas. Instrumentar interfaces importantes, não funções internas. Usar o Skill tool com name `code-practices`, o Skill tool com name `codebase-design`, o Skill tool com name `diagnosing-bugs`, o Skill tool com name `arktype` e o Skill tool com name `testing-with-tdd`.

### Addresses

`Observabilidade local` em `spec.md`.

## provider-discovery

### Outcome

A pessoa vê se Codex e Claude Code estão instalados, autenticados e disponíveis sem o aplicativo ler ou armazenar tokens.

### Acceptance criteria

- [ ] O Bun Engine descobre os executáveis Codex e Claude Code.
- [ ] Cada fornecedor informa versão e estado de login pelo fluxo oficial.
- [ ] Saídas externas são validadas na entrada antes de virarem estado interno.
- [ ] O Renderer apresenta disponível, desautenticado, ausente ou incompatível.
- [ ] Nenhum token, cookie, e-mail ou ambiente completo entra em logs ou respostas.
- [ ] Probes possuem timeout e encerram todos os subprocessos.
- [ ] Observations medem descoberta, autenticação, duração e falhas.

### Blocked by

`local-observability`.

### Context

Reusar os protocolos confirmados pelo protótipo e pelo estudo do t3code. Usar o Skill tool com name `external-integration`, o Skill tool com name `openai-docs`, o Skill tool com name `code-practices`, o Skill tool com name `arktype` e o Skill tool com name `testing-with-tdd`.

### Addresses

`Critério de conclusão` item 2, `Execução dos fornecedores` e `Decisões pendentes` em `spec.md`.

## create-team

### Outcome

A pessoa cria, lista e abre um Time persistente com objetivo, fornecedor padrão e exatamente um Líder.

### Acceptance criteria

- [ ] A pessoa informa nome, objetivo, fornecedor padrão e Função do Líder.
- [ ] Criar o Time e o Líder acontece numa única transação.
- [ ] Um Time nunca fica sem Líder nem com mais de um Líder.
- [ ] O fornecedor escolhido precisa estar disponível.
- [ ] O Time aparece na lista e continua disponível depois de reiniciar.
- [ ] O Renderer usa oRPC com TanStack Query e invalida a lista depois da criação.
- [ ] Inputs são validados com Arktype e Spans cobrem oRPC e banco.

### Blocked by

`provider-discovery`.

### Context

Usar o Skill tool com name `domain-modeling`, o Skill tool com name `code-practices`, o Skill tool com name `codebase-design`, o Skill tool com name `arktype`, o Skill tool com name `tanstack-query`, o Skill tool com name `frontend`, o Skill tool com name `react-components` e o Skill tool com name `testing-with-tdd`.

### Addresses

`Modelo do produto: Time e Bots` e `Critério de conclusão` item 3 em `spec.md`.

## manage-members

### Outcome

A pessoa adiciona Integrantes permanentes a um Time e define suas Funções e fornecedores.

### Acceptance criteria

- [ ] A pessoa cria Integrante permanente com nome, Função e fornecedor.
- [ ] Cada Bot pertence a somente um Time.
- [ ] O Bot usa o fornecedor padrão ou uma substituição explícita.
- [ ] A Função separa resultado, responsabilidades, limites e forma de entrega.
- [ ] A lista distingue Líder e Integrantes.
- [ ] Dados persistem e operações usam oRPC com TanStack Query.
- [ ] Observations medem operações sem registrar a Função textual.

### Blocked by

`create-team`.

### Context

Usar o Skill tool com name `domain-modeling`, o Skill tool com name `code-practices`, o Skill tool com name `codebase-design`, o Skill tool com name `arktype`, o Skill tool com name `tanstack-query`, o Skill tool com name `frontend`, o Skill tool com name `react-components` e o Skill tool com name `testing-with-tdd`.

### Addresses

`Bots permanentes e temporários`, `Função, memória e contexto` e `Critério de conclusão` item 4 em `spec.md`, somente para Integrantes permanentes.

## chat-with-bot

### Outcome

A pessoa conversa com um Líder ou Integrante pelo fornecedor escolhido, acompanha o stream e reabre a conversa persistida.

### Acceptance criteria

- [ ] A pessoa abre o chat de qualquer Bot do Time.
- [ ] Enviar uma mensagem inicia Codex ou Claude Code conforme o fornecedor.
- [ ] Eventos parciais chegam ao Renderer por stream do oRPC.
- [ ] Mensagens persistidas identificam autor e ordem cronológica.
- [ ] Reabrir o chat carrega o histórico pelo TanStack Query.
- [ ] Interromper encerra o turno e preserva o histórico confirmado.
- [ ] Payloads dos fornecedores são normalizados na entrada.
- [ ] Observations medem início, primeiro evento, contagens, bytes, duração, interrupção e erro sem conteúdo.

### Blocked by

`manage-members`.

### Context

Codex e Claude usam Adapters separados que satisfazem a mesma interface. Usar o Skill tool com name `external-integration`, o Skill tool com name `openai-docs`, o Skill tool com name `code-practices`, o Skill tool com name `codebase-design`, o Skill tool com name `arktype`, o Skill tool com name `tanstack-query`, o Skill tool com name `frontend`, o Skill tool com name `react-components` e o Skill tool com name `testing-with-tdd`.

### Addresses

`Conversas`, `Execução dos fornecedores` e `Critério de conclusão` itens 5, 7 e 8 em `spec.md`.

## leader-delegation

### Outcome

O Líder cria uma Tarefa, delega a um Integrante e recebe o resultado numa conversa visível para a pessoa.

### Acceptance criteria

- [ ] Uma Tarefa possui resultado esperado e um único Bot responsável.
- [ ] O Líder escolhe um Integrante e envia a delegação.
- [ ] O Integrante responde diretamente ao Líder.
- [ ] A conversa mostra pessoa, Líder e outros Bots em ordem cronológica.
- [ ] Uma Ordem direta da pessoa prevalece sobre a instrução do Líder.
- [ ] Transferir responsabilidade cria uma mensagem visível.
- [ ] O Líder recebe o resultado e continua responsável pelo Time.
- [ ] Observations correlacionam Líder e Integrante pelo mesmo `traceId` e pela Tarefa.

### Blocked by

`chat-with-bot`.

### Context

Usar o Skill tool com name `domain-modeling`, o Skill tool com name `code-practices`, o Skill tool com name `codebase-design`, o Skill tool com name `arktype` e o Skill tool com name `testing-with-tdd`.

### Addresses

`Autoridade`, `Tarefas`, `Conversas` e `Critério de conclusão` item 6 em `spec.md`.

## temporary-bot-delegation

### Outcome

A pessoa ou o Líder cria um Bot temporário para uma Tarefa, recebe sua entrega e encerra o Bot preservando o histórico.

### Acceptance criteria

- [ ] A pessoa cria Bot temporário com Função, fornecedor e Tarefa.
- [ ] O Líder cria Bot temporário com Função, fornecedor e Tarefa.
- [ ] O Bot temporário não cria outros Bots.
- [ ] O Bot temporário conversa com Líder e colaboradores do mesmo Time.
- [ ] Encerrar a Tarefa encerra o Bot e seus acessos.
- [ ] A memória descartável não entra automaticamente na Memória do Time.
- [ ] O histórico permanece ligado à Tarefa.
- [ ] A pessoa distingue Bots ativos e encerrados.
- [ ] Observations correlacionam criação, execução e encerramento sem registrar conteúdo.

### Blocked by

`leader-delegation`.

### Context

Usar o Skill tool com name `domain-modeling`, o Skill tool com name `code-practices`, o Skill tool com name `codebase-design`, o Skill tool com name `arktype` e o Skill tool com name `testing-with-tdd`.

### Addresses

`Bots permanentes e temporários` e `Escopo da V1` em `spec.md`.

## local-continuity

### Outcome

Fechar e abrir o aplicativo preserva Times, Bots e conversas, enquanto execuções interrompidas aguardam uma decisão da pessoa.

### Acceptance criteria

- [ ] Reiniciar preserva Times, Bots, Funções e conversas.
- [ ] Uma execução ativa no encerramento reaparece como interrompida.
- [ ] Nenhuma execução interrompida retoma automaticamente.
- [ ] A pessoa pode revisar, cancelar ou iniciar uma continuação.
- [ ] A recuperação não duplica mensagens nem Tarefas.
- [ ] Falhas de recuperação produzem diagnóstico sem corromper o banco.
- [ ] Um teste fecha e reabre os processos e confirma o estado esperado.
- [ ] Spans distinguem inicialização normal, recuperação e falha.

### Blocked by

`chat-with-bot`.

### Context

Usar o Skill tool com name `diagnosing-bugs`, o Skill tool com name `code-practices`, o Skill tool com name `codebase-design`, o Skill tool com name `arktype` e o Skill tool com name `testing-with-tdd`.

### Addresses

`Critério de conclusão` item 9 e `Fora da V1` sobre retomada automática em `spec.md`.
