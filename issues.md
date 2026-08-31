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

Recriar somente os comportamentos validados no protótipo técnico; não copiar sua estrutura descartável. Usar o Skill tool com name `code-practices`, o Skill tool com name `codebase-design`, o Skill tool com name `external-integration`, o Skill tool com name `arktype` e o Skill tool com name `testing-with-tdd`.

### Addresses

`Stack`, `Arquitetura do Electron`, `Organização do código` e `Veredito dos protótipos` em `spec.md`.

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

`Critério de conclusão` item 2 e `Execução dos fornecedores` em `spec.md`.

## bots-as-primary-unit

### Outcome

A pessoa cria, lista, abre e configura um Bot persistente sem precisar criar um Time.

### Acceptance criteria

- [ ] A pessoa cria um Bot com nome, Função e executor.
- [ ] Codex ou Claude Code só pode ser escolhido quando estiver disponível.
- [ ] O Bot existe sem Líder, Integrante ou objeto Time associado.
- [ ] O Bot aparece na lista principal com um único avatar.
- [ ] A pessoa abre o Bot e consulta sua Função e seu executor.
- [ ] O Bot continua disponível depois de reiniciar o aplicativo.
- [ ] O schema inicial persiste Bots diretamente, sem tabela ou objeto Time.
- [ ] O Renderer usa oRPC com TanStack Query e invalida a lista depois de alterações.
- [ ] Inputs são validados com Arktype e Spans cobrem oRPC e banco.

### Blocked by

`provider-discovery`.

### Context

Este é o prefactor que substitui `create-team` e adapta o código de `manage-members`. A relação opcional com Integrantes pertence ao Bot; não criar uma entidade Time paralela. Usar o Skill tool com name `domain-modeling`, o Skill tool com name `code-practices`, o Skill tool com name `codebase-design`, o Skill tool com name `arktype`, o Skill tool com name `tanstack-query`, o Skill tool com name `frontend`, o Skill tool com name `react-components` e o Skill tool com name `testing-with-tdd`.

### Addresses

`Critério de conclusão` item 3, `Bots, Líderes e Integrantes` e `Função, memória e contexto` em `spec.md`.

## bot-working-directory

### Outcome

Cada Bot executa em uma pasta escolhida pela pessoa ou em uma pasta privada administrada pelo aplicativo.

### Acceptance criteria

- [ ] Criar um Bot permite escolher uma pasta ou continuar sem escolher.
- [ ] O seletor nativo retorna somente uma pasta validada pelo Main e Preload.
- [ ] Sem escolha, o Bun Engine cria e usa uma pasta privada vazia para o Bot.
- [ ] A pessoa consulta, troca ou remove a pasta escolhida nas configurações do Bot.
- [ ] Remover uma pasta escolhida volta a usar a pasta privada do Bot.
- [ ] A execução recebe a pasta efetiva sem usar o diretório pessoal como padrão.
- [ ] Uma pasta inexistente ou inacessível produz um erro visível antes da execução.
- [ ] O caminho completo não entra em Observations.
- [ ] Testes cobrem pasta escolhida, pasta privada e caminho inválido.

### Blocked by

`bots-as-primary-unit`.

### Context

A pasta escolhida é configuração persistida; a pasta privada é um recurso administrado pelo aplicativo. Não criar worktrees nem controle de concorrência. Usar o Skill tool com name `code-practices`, o Skill tool com name `codebase-design`, o Skill tool com name `arktype`, o Skill tool com name `frontend`, o Skill tool com name `react-components` e o Skill tool com name `testing-with-tdd`.

### Addresses

`Pasta de trabalho`, `Arquitetura do Electron: Main` e `Fora da V1` em `spec.md`.

## chat-with-bot

### Outcome

A pessoa conversa com um Bot pelo executor escolhido, acompanha a resposta e reabre a conversa persistida na interface validada pelo protótipo.

### Acceptance criteria

- [ ] A lista principal mostra Bots independentes e Líderes, sem exigir uma lista de Times.
- [ ] A pessoa abre o chat de qualquer Bot.
- [ ] Enviar uma mensagem inicia Codex ou Claude Code na pasta efetiva do Bot.
- [ ] Eventos parciais chegam ao Renderer por stream do oRPC.
- [ ] Mensagens persistidas identificam autor e ordem cronológica.
- [ ] Reabrir o chat carrega o histórico pelo TanStack Query.
- [ ] Interromper encerra o turno e preserva o histórico confirmado.
- [ ] A interface mostra estado disponível, trabalhando, aguardando, concluído ou com erro.
- [ ] Payloads dos fornecedores são normalizados na entrada.
- [ ] Observations medem início, primeiro evento, contagens, bytes, duração, interrupção e erro sem conteúdo.

### Blocked by

`bot-working-directory`.

### Context

Codex e Claude usam Adapters separados que satisfazem a mesma interface. Implementar o comportamento do protótipo sem copiar sua estrutura descartável. Usar o Skill tool com name `external-integration`, o Skill tool com name `openai-docs`, o Skill tool com name `code-practices`, o Skill tool com name `codebase-design`, o Skill tool com name `arktype`, o Skill tool com name `tanstack-query`, o Skill tool com name `frontend`, o Skill tool com name `react-components` e o Skill tool com name `testing-with-tdd`.

### Addresses

`Critério de conclusão` item 4, `Conversas`, `Execução dos fornecedores` e `Veredito dos protótipos` em `spec.md`.

## add-bot-members

### Outcome

A pessoa adiciona um Integrante a um Bot, que passa a atuar como Líder, e abre o chat do Integrante diretamente.

### Acceptance criteria

- [ ] A pessoa cria um Integrante permanente com nome, Função e executor.
- [ ] O Integrante pertence a um único Líder.
- [ ] O primeiro Integrante faz o Bot atuar como Líder sem criar um objeto Time.
- [ ] O Integrante herda a pasta do Líder e permite que a pessoa a troque ou remova.
- [ ] A lista mostra um avatar para Bots independentes e até três avatares empilhados para Líderes.
- [ ] A pessoa abre o chat e as configurações de qualquer Integrante.
- [ ] Remover o último Integrante faz o Líder voltar a aparecer como Bot independente.
- [ ] Dados persistem e operações usam oRPC com TanStack Query.
- [ ] Observations medem operações sem registrar Função ou pasta.

### Blocked by

`bot-working-directory`.

### Context

Adaptar o comportamento persistente já criado em `manage-members`; remover a dependência de Time. Usar o Skill tool com name `domain-modeling`, o Skill tool com name `code-practices`, o Skill tool com name `codebase-design`, o Skill tool com name `arktype`, o Skill tool com name `tanstack-query`, o Skill tool com name `frontend`, o Skill tool com name `react-components` e o Skill tool com name `testing-with-tdd`.

### Addresses

`Critério de conclusão` itens 5 e 8, `Bots, Líderes e Integrantes`, `Pasta de trabalho` e `Integrantes permanentes e temporários` em `spec.md`.

## leader-delegation

### Outcome

O Líder cria uma Tarefa, delega a um Integrante e recebe o resultado numa conversa visível para a pessoa.

### Acceptance criteria

- [ ] Uma Tarefa possui resultado esperado e um único Bot responsável.
- [ ] O Líder escolhe um Integrante e envia a delegação.
- [ ] O Integrante responde diretamente ao Líder.
- [ ] O chat do Líder mostra a delegação, seu estado e um atalho para abrir o Integrante.
- [ ] A conversa relacionada mostra pessoa, Líder e Integrantes em ordem cronológica.
- [ ] Uma ordem direta da pessoa prevalece sobre a instrução do Líder.
- [ ] Transferir responsabilidade cria uma mensagem visível.
- [ ] O Líder recebe o resultado e continua responsável pelo trabalho geral.
- [ ] Observations correlacionam Líder e Integrante pelo mesmo `traceId` e pela Tarefa.

### Blocked by

`chat-with-bot` e `add-bot-members`.

### Context

Usar o Skill tool com name `domain-modeling`, o Skill tool com name `code-practices`, o Skill tool com name `codebase-design`, o Skill tool com name `arktype` e o Skill tool com name `testing-with-tdd`.

### Addresses

`Critério de conclusão` itens 6 e 7, `Autoridade`, `Tarefas` e `Conversas` em `spec.md`.

## temporary-members

### Outcome

A pessoa ou o Líder cria um Integrante temporário para uma Tarefa, recebe sua entrega e encerra o Integrante preservando o histórico.

### Acceptance criteria

- [ ] A pessoa cria um Integrante temporário com Função, executor e Tarefa.
- [ ] O Líder cria um Integrante temporário com Função, executor e Tarefa.
- [ ] O Integrante temporário herda a pasta de quem o criou e permite substituição explícita.
- [ ] O Integrante temporário não cria outros Bots.
- [ ] O Integrante temporário conversa com o Líder e os Integrantes do mesmo grupo.
- [ ] Encerrar a Tarefa encerra o Integrante e seus acessos.
- [ ] A memória descartável não entra automaticamente na memória de outro Bot.
- [ ] O histórico permanece ligado à Tarefa.
- [ ] A interface distingue Integrantes permanentes, temporários ativos e temporários encerrados.
- [ ] Observations correlacionam criação, execução e encerramento sem registrar conteúdo.

### Blocked by

`leader-delegation`.

### Context

Usar o Skill tool com name `domain-modeling`, o Skill tool com name `code-practices`, o Skill tool com name `codebase-design`, o Skill tool com name `arktype` e o Skill tool com name `testing-with-tdd`.

### Addresses

`Integrantes permanentes e temporários`, `Pasta de trabalho` e `Escopo da V1` em `spec.md`.

## local-continuity

### Outcome

Fechar e abrir o aplicativo preserva Bots, relações, configurações e conversas, enquanto execuções interrompidas aguardam uma decisão da pessoa.

### Acceptance criteria

- [ ] Reiniciar preserva Bots, Integrantes, Funções, executores, pastas escolhidas e conversas.
- [ ] Pastas privadas continuam associadas aos Bots corretos.
- [ ] Uma execução ativa no encerramento reaparece como interrompida.
- [ ] Nenhuma execução interrompida retoma automaticamente.
- [ ] A pessoa pode revisar, cancelar ou iniciar uma continuação.
- [ ] A recuperação não duplica mensagens nem Tarefas.
- [ ] Falhas de recuperação produzem diagnóstico sem corromper o banco.
- [ ] Um teste fecha e reabre os processos e confirma o estado esperado.
- [ ] Spans distinguem inicialização normal, recuperação e falha.

### Blocked by

`chat-with-bot` e `add-bot-members`.

### Context

Usar o Skill tool com name `diagnosing-bugs`, o Skill tool com name `code-practices`, o Skill tool com name `codebase-design`, o Skill tool com name `arktype` e o Skill tool com name `testing-with-tdd`.

### Addresses

`Critério de conclusão` item 9 e `Fora da V1` sobre retomada automática em `spec.md`.
