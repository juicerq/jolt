# V1 do Jots

## Objetivo

Criar um aplicativo desktop local no qual uma pessoa cria Bots, conversa com cada um e, quando precisa dividir um trabalho, adiciona Integrantes a um Bot. Esse Bot passa a atuar como Líder. Os Bots usam as sessões já autenticadas da pessoa no Codex ou no Claude Code.

## Critério de conclusão

A V1 está concluída quando este fluxo funciona de ponta a ponta com Codex e Claude Code:

1. A pessoa abre o aplicativo local.
2. O aplicativo encontra Codex e Claude Code já autenticados.
3. A pessoa cria um Bot com uma pasta de trabalho opcional.
4. A pessoa conversa com o Bot e reabre seu histórico.
5. A pessoa adiciona um Integrante ao Bot, que passa a atuar como Líder.
6. O Líder delega uma Tarefa ao Integrante.
7. O Integrante responde ao Líder.
8. A pessoa abre o Integrante e vê a conversa relacionada.
9. Fechar e abrir o aplicativo preserva Bots, Integrantes e conversas.

## Escopo da V1

- Execução somente na máquina da pessoa.
- Suporte a Codex e Claude Code pelas sessões oficiais já autenticadas.
- Bots independentes.
- Pasta de trabalho opcional por Bot.
- Integrantes permanentes adicionados a um Bot.
- Bots com Integrantes atuam como Líderes.
- Integrantes temporários criados pela pessoa ou pelo Líder.
- Chat direto com qualquer Bot ou Integrante.
- Delegação de Tarefas entre Líder e Integrantes.
- Conversas entre Bots do mesmo grupo.
- Histórico persistente e visível.
- Memória inicial formada pelo histórico persistente e pelas instruções editáveis do Bot.

## Modelo do produto

### Bots, Líderes e Integrantes

- Bot é a unidade principal do produto.
- Um Bot pode existir sozinho.
- A pessoa pode adicionar Integrantes a qualquer Bot.
- Um Bot com pelo menos um Integrante atua como Líder.
- Líder e Integrante continuam sendo Bots.
- Um Integrante pertence a um único Líder.
- Remover o último Integrante faz o Líder voltar a ser um Bot independente.
- A pessoa abre o chat de qualquer Bot ou Integrante a qualquer momento.
- Cada Bot escolhe Codex ou Claude Code como executor.
- O executor não muda silenciosamente durante uma Tarefa.
- A interface mostra um avatar para um Bot independente e até três avatares empilhados para um Líder com Integrantes.

### Pasta de trabalho

- A pasta de trabalho é opcional na criação do Bot.
- Quando a pessoa não escolhe uma pasta, o aplicativo usa uma pasta privada vazia sob seu próprio diretório de dados.
- A pessoa pode trocar ou remover a pasta escolhida.
- Um Integrante herda a pasta do Líder ao ser criado.
- A pessoa pode trocar ou remover a pasta herdada de um Integrante.
- Um Integrante temporário herda a pasta de quem o criou.
- O aplicativo mostra a pasta efetiva nas configurações do Bot.
- A V1 não cria worktrees nem protege uma pasta contra edições concorrentes.

### Autoridade

- A precedência de instruções é Pessoa, Líder e Integrante, nessa ordem.
- Uma ordem direta da pessoa prevalece sobre uma instrução do Líder.
- O Integrante informa ao Líder quando uma ordem direta muda seu trabalho.
- Um conflito entre ordens interrompe o trabalho conflitante e volta para a pessoa decidir.
- O Líder pode decompor um objetivo, criar Tarefas, delegar, pedir correções e reunir o resultado.

### Tarefas

- Cada Tarefa possui um único Bot responsável.
- Outros Bots do mesmo grupo podem colaborar sem assumir a responsabilidade.
- O Líder continua responsável pelo resultado geral.
- Uma transferência de responsabilidade aparece na conversa.

### Conversas

- Cada Bot ou Integrante possui uma linha cronológica de conversa.
- Cada mensagem identifica seu autor.
- Mensagens entre a pessoa, o Líder e os Integrantes aparecem no histórico relacionado.
- Nenhuma conversa entre Bots fica oculta da pessoa ou do Líder.
- Integrantes podem conversar diretamente sem usar o Líder como retransmissor.
- A interface mostra delegações no chat do Líder e permite abrir o chat do Integrante responsável.
- A atividade de execução pode aparecer separada das mensagens.

### Integrantes permanentes e temporários

- A pessoa pode criar um Integrante permanente.
- O Líder pode propor um Integrante permanente, mas a pessoa confirma sua criação.
- A pessoa ou o Líder pode criar um Integrante temporário para uma Tarefa.
- Um Integrante temporário não pode criar outros Bots.
- O Integrante temporário encerra com sua Tarefa.
- Os acessos e a memória descartável do Integrante temporário terminam com ele.
- Seu histórico permanece ligado à Tarefa.

### Função, memória e contexto

- A Função do Bot define resultado esperado, responsabilidades, limites e forma de entrega.
- Nome, executor, memória, pasta e acessos não fazem parte da Função.
- A V1 não precisa de busca semântica nem memória automática avançada.
- O Bot recebe conhecimento da existência de histórico, memória, arquivos, ferramentas e outros Bots do grupo.
- O Bot decide quando consultar esses recursos.
- Identidade, Função, Tarefa, ordens diretas, acessos e limites aplicáveis nunca dependem dessa consulta opcional.

## Execução dos fornecedores

### Regra comum

- O aplicativo não recebe nem administra tokens das assinaturas.
- A pessoa autentica os agentes pelos fluxos oficiais do Codex e do Claude Code.
- A execução acontece na mesma máquina que contém essas sessões.
- Bots, conversas e Tarefas pertencem ao aplicativo.
- Codex e Claude Code implementam uma interface comum de execução por meio de adaptadores separados.

### Codex

- O adaptador inicia `codex app-server`.
- O adaptador controla threads, turnos, interrupções, eventos e pedidos de aprovação pelo protocolo do App Server.

### Claude Code

- O adaptador usa o Claude Agent SDK e o executável local do Claude Code.
- O adaptador controla sessões, mensagens, interrupções, eventos e pedidos de aprovação pelo SDK.

## Stack

- Electron.
- TypeScript.
- React.
- electron-vite.
- Bun como gerenciador de pacotes e executor de scripts e testes sempre que o runtime permitir.
- Arktype para validar dados externos na entrada.
- TanStack Router.
- TanStack Query.
- TanStack Store pelo adaptador React.
- oRPC.
- Tailwind CSS.
- SQLite.
- Drizzle ORM e Drizzle Kit.

O Bun Engine usa `bun:sqlite` como driver SQLite do Drizzle.

## Arquitetura do Electron

### Main

O processo Main cria a janela, inicia e supervisiona o Bun Engine, encerra o processo filho com o aplicativo e executa funções nativas do Electron, como escolher uma pasta. Ele não possui regras de Bots, conversas ou fornecedores.

### Bun Engine

O Bun Engine possui Bots, relações entre Líderes e Integrantes, conversas, persistência e execução dos fornecedores. Ele acessa o banco por Drizzle com `bun:sqlite` e inicia Codex ou Claude Code.

### Preload

O Preload expõe uma interface pequena e tipada para funções nativas do Electron. Ele também entrega ao Renderer os dados temporários necessários para alcançar o Bun Engine sem expor Node ou Electron.

### Renderer

O Renderer apresenta a interface validada pelo protótipo e envia intenções. Ele não acessa arquivos, banco, Codex ou Claude Code diretamente. Recarregar o Renderer não encerra uma execução que pertence ao Bun Engine.

### Comunicação

- O Renderer usa oRPC para consultar e alterar o estado pertencente ao Bun Engine.
- TanStack Query controla no Renderer o estado persistido carregado do Bun Engine.
- TanStack Store controla estado compartilhado que existe apenas no Renderer; estado local continua no componente mais próximo.
- `useEffect` é proibido, exceto quando uma sincronização externa não puder ser modelada por renderização, eventos, TanStack Query, TanStack Store ou uma API dedicada de assinatura.
- Streams do oRPC transportam eventos transitórios de execução.
- O Bun Engine escuta somente no loopback local, numa porta escolhida durante a inicialização.
- Cada inicialização gera um token temporário exigido pelo servidor local.
- O IPC do Electron fica restrito a funções nativas e ao ciclo de vida do Bun Engine.
- Os contratos do oRPC usam Arktype para validar entradas e saídas entre processos.
- Tipos são derivados dos contratos; não existem cópias manuais em pastas genéricas.

## Organização do código

Os módulos iniciais representam conceitos do produto:

```text
src/
├── engine/
│   ├── app/
│   ├── bots/
│   ├── conversations/
│   ├── execution/
│   ├── codex/
│   ├── claude/
│   ├── persistence/
│   └── index.ts
├── main/
│   ├── engine-process/
│   ├── desktop/
│   └── index.ts
├── preload/
│   └── index.ts
├── renderer/
│   ├── app/
│   ├── bots/
│   ├── chat/
│   ├── routes/
│   ├── styles.css
│   └── main.tsx
└── shared/
    ├── bots.ts
    ├── conversations.ts
    └── execution.ts
```

- Arquivos e pastas usam `kebab-case`.
- Classes, tipos e componentes React usam `PascalCase`.
- Cada pasta possui um conceito definido.
- Não existem pastas genéricas como `utils`, `helpers`, `services`, `managers` ou `common`.
- Codex e Claude Code satisfazem a mesma interface de fornecedor.
- O Renderer não importa o Main nem o Bun Engine.
- O Main não importa módulos de domínio do Bun Engine.
- O Bun Engine não importa Electron nem o Renderer.
- Tipos compartilhados ficam próximos do conceito correspondente.
- Um módulo só é dividido quando a divisão reduz o que seus consumidores precisam conhecer.

## Observabilidade local

### Objetivo

A V1 produz dados suficientes para depurar falhas e analisar performance entre Renderer, Electron Main, Bun Engine, banco, Codex e Claude Code. A observabilidade não depende de um serviço remoto.

### Modelo

- `Observation` é o único formato interno.
- Um `Event` registra algo que aconteceu.
- Um `Span` registra o começo e o fim de uma operação.
- Métricas são derivadas dos Spans; não existe um sistema separado de métricas na V1.
- A interface pública possui apenas `event`, `span` e `flush`.
- `AsyncLocalStorage` propaga o contexto dentro do Bun Engine.
- Cada ação iniciada no Renderer recebe um `traceId` propagado pelo oRPC.
- Spans possuem `spanId` e podem referenciar um `parentSpanId`.

### Campos de correlação

Uma Observation pode incluir `appSessionId`, `traceId`, `spanId`, `parentSpanId`, `botId`, `leaderBotId`, `taskId` e `provider`. Campos ausentes não são preenchidos com valores vazios.

### Medições da V1

- Inicialização e encerramento do Electron Main e do Bun Engine.
- Duração das operações oRPC.
- Duração das transações no banco.
- Inicialização de Codex e Claude Code.
- Tempo até o primeiro evento do fornecedor.
- Duração total da execução.
- Contagem de eventos e bytes do stream.
- Duração das chamadas de ferramentas.
- Persistência de mensagens.
- Pedidos de aprovação, interrupções e falhas.

Funções internas triviais, eventos de interface e cada fragmento de streaming não geram Observations próprios.

### Saídas

- Um Adapter JSONL grava arquivos locais com rotação.
- Um Adapter de console funciona somente em desenvolvimento.
- Um buffer limitado em memória alimenta a tela de diagnóstico.
- Falhar ao gravar observabilidade não interrompe o trabalho do Bot.
- `flush` conclui gravações pendentes durante o encerramento normal.
- OpenTelemetry não faz parte da V1; um Adapter poderá ser criado depois sem alterar os módulos consumidores.

### Privacidade

- Atributos seguem uma lista permitida.
- Observations podem registrar IDs, nomes estáveis, contagens, tamanhos, durações, códigos, versões e estados.
- Observations não registram conteúdo de mensagem, prompt, resposta, raciocínio, arquivo, ambiente, header, token, cookie nem evento bruto de fornecedor.
- Erros externos são normalizados para tipo, código, mensagem e stack antes da gravação.

### Diagnóstico

A tela local de diagnóstico mostra versões, estado dos processos, estado de autenticação, últimas falhas, operações mais lentas, p50, p95, máximos e caminho dos logs. A pessoa pode exportar um pacote sem segredos contendo Observations, versões, configuração não sensível e estado das migrações.

### Verificação

- Um teste prova a propagação do contexto por oRPC, Drizzle e subprocessos.
- Um teste tenta registrar dados proibidos e confirma que eles não chegam ao JSONL.
- Cada função nova define seus Spans relevantes antes de ser considerada concluída.

## Fora da V1

- BYOK e cobrança por API key.
- VPS, execução remota e controle remoto.
- Filas e limites avançados de paralelismo.
- Agendamentos e trabalho sempre ativo.
- Integrações com serviços externos.
- Permissões detalhadas por ferramenta.
- Memória semântica e recuperação automática avançada.
- Worktrees e edição concorrente de projetos.
- Múltiplas contas por fornecedor.
- Retomada automática após fechar o aplicativo ou reiniciar a máquina.
- Aplicativo administrando ou copiando tokens de assinatura.

## Veredito dos protótipos

O protótipo do Bun Engine aprovou a arquitetura para desenvolvimento local no Linux:

- Electron iniciou e encerrou um Bun Engine sem deixar processo órfão.
- O Main recebeu do Bun Engine uma mensagem de prontidão validada com Arktype.
- O Bun Engine expôs oRPC somente em `127.0.0.1` e exigiu um token efêmero.
- Uma requisição sem token recebeu HTTP 401.
- TanStack Query consultou e invalidou estado persistido pelo oRPC.
- Um Event Iterator do oRPC entregou três eventos ordenados ao Renderer.
- Drizzle leu e gravou SQLite por meio de `bun:sqlite`.
- Bun iniciou o Codex App Server, completou o handshake e consultou conta e modelos sem iniciar uma Tarefa.
- Claude Agent SDK inicializou no Bun e controlou o processo local sem custo.
- `bun build --compile` gerou um executável do Bun Engine.
- Electron iniciou o executável compilado em modo de desenvolvimento.
- TypeScript e os builds do Bun Engine e do Electron passaram.
- Uma instalação limpa com lockfile fixo instalou as dependências e o binário do Electron pelo `postinstall` explícito.

O protótipo da interface aprovou estes comportamentos:

- A lista principal contém Bots, não Times.
- Um Bot independente usa um avatar.
- Um Líder com Integrantes usa até três avatares empilhados.
- Criar Bot pede nome, Função, executor e pasta opcional.
- Adicionar o primeiro Integrante transforma o Bot em Líder.
- O chat permite abrir conversas relacionadas a uma delegação.
- As configurações permitem consultar e alterar a pasta de trabalho.
- Integrantes temporários aparecem separados dos permanentes.

Os protótipos ainda não provaram:

- uma resposta real do Claude por assinatura, pois o Claude Code local não está autenticado;
- empacotamento e execução em Windows ou macOS;
- distribuição dos binários específicos do Claude Agent SDK em cada plataforma;
- um instalador final do Electron contendo o Bun Engine compilado.
