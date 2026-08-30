# Times de bots

Este contexto define como uma pessoa organiza bots persistentes em times e acompanha o trabalho realizado entre eles.

## Linguagem

**Time**:
Um grupo de bots que compartilha um objetivo e possui exatamente um Líder. Cada Bot pertence a somente um Time.
_Evitar_: Equipe, grupo

**Bot**:
Um participante persistente com identidade, função, contexto, memória e histórico próprios.
_Evitar_: Agente, assistente

**Bot temporário**:
Um Bot criado pela pessoa ou pelo Líder para uma única Tarefa. Ele perde seus acessos e sua memória ao encerrar, enquanto seu histórico permanece ligado à Tarefa.
_Evitar_: Integrante, subprocesso, Bot permanente

**Fornecedor do Bot**:
O agente compatível, como Codex ou Claude Code, escolhido para executar o trabalho de um Bot. Cada Time possui um fornecedor padrão, e cada Bot pode ter sua própria escolha.
_Evitar_: Modelo, Conexão, troca automática

**Função do Bot**:
O contrato permanente que define o resultado esperado, as responsabilidades, os limites e a forma de entrega de um Bot.
_Evitar_: Personalidade, prompt, memória, acesso

**Contexto do Bot**:
A seleção temporária de informações usadas numa execução. O Bot pode consultar memória, histórico, arquivos e outros Bots para ampliar essa seleção durante o trabalho.
_Evitar_: Memória, histórico completo, prompt permanente

**Regras vigentes**:
A identidade, a Função do Bot, a Tarefa, as Ordens diretas, os acessos e os Limites de aprovação que se aplicam a uma execução independentemente do contexto escolhido pelo Bot.
_Evitar_: Memória opcional, sugestão, contexto recuperado

**Espaço do Time**:
O conjunto de arquivos compartilhados e entregas disponíveis aos Bots de um Time.
_Evitar_: Área do Bot, diretório global

**Área do Bot**:
O espaço isolado onde um Bot mantém seu trabalho em andamento antes de publicá-lo no Espaço do Time.
_Evitar_: Espaço do Time, arquivo compartilhado

**Líder**:
O Bot que representa o Time por padrão e responde pelo trabalho dos Integrantes.
_Evitar_: Orquestrador, bot principal

**Integrante**:
Um Bot pertencente a um Time que exerce uma função própria e conversa com o Líder.
_Evitar_: Subagente, bot secundário, especialista

**Proposta de Integrante**:
O pedido do Líder para adicionar um Integrante permanente ao Time. A proposta descreve a função e os acessos pretendidos, e depende da confirmação da pessoa.
_Evitar_: Bot temporário, criação automática

**Cópia de Bot**:
Um novo Bot criado a partir da função de outro Bot. A cópia possui Time, memória e histórico próprios.
_Evitar_: Bot compartilhado, clone sincronizado

**Memória do Time**:
O conhecimento persistente disponível ao Líder e a todos os Integrantes de um Time.
_Evitar_: Contexto global, memória compartilhada entre times

**Memória do Bot**:
O conhecimento persistente ligado à função de um Bot. A pessoa e o Líder podem consultá-la; outros Integrantes pedem esse conhecimento ao Bot pela conversa.
_Evitar_: Memória privada, memória do Time

**Conversa do Integrante**:
A linha cronológica das mensagens trocadas pelo Integrante com a pessoa, o Líder e outros Bots do Time. Cada mensagem identifica seu autor, e nenhuma conversa entre Bots fica oculta da pessoa ou do Líder.
_Evitar_: Histórico separado, log interno, transcript

**Conversa entre Bots**:
Uma troca direta entre Bots do mesmo Time, ligada a uma Tarefa e visível para a pessoa e para o Líder.
_Evitar_: Mensagem oculta, recado retransmitido pelo Líder

**Atividade**:
O registro de ações executadas por um Bot, separado da conversa.
_Evitar_: Mensagem, raciocínio interno

**Ordem direta**:
Uma instrução enviada pela pessoa a um Bot. Ela prevalece sobre instruções do Líder, e o Integrante comunica ao Líder qualquer mudança causada por ela.
_Evitar_: Sugestão, mensagem prioritária

**Conflito de ordens**:
A incompatibilidade entre uma Ordem direta e uma instrução do Líder. O Integrante interrompe o trabalho conflitante e pede a decisão da pessoa.
_Evitar_: Erro de delegação

**Conexão**:
Uma credencial ou autorização que pertence à conta da pessoa e permite acesso a um serviço externo. Bots autorizados usam a Conexão sem receber seu segredo.
_Evitar_: Credencial do Bot, segredo na memória

**Conexão por Assinatura**:
Uma Conexão que usa a sessão oficial já autenticada pela pessoa em um agente compatível, como Codex ou Claude Code.
_Evitar_: BYOK, API key do modelo

**Execução local**:
O trabalho de um Bot realizado na máquina da pessoa por meio das sessões já autenticadas no Codex ou no Claude Code.
_Evitar_: Execução remota, execução em VPS

**Tarefa interrompida**:
Uma tarefa cuja Execução local terminou antes da conclusão. Ela preserva seu histórico e aguarda uma decisão da pessoa antes de continuar.
_Evitar_: Tarefa em execução, retomada automática

**Tarefa**:
Um trabalho com resultado esperado e um único Bot responsável. Outros Bots podem colaborar sem assumir a responsabilidade.
_Evitar_: Mensagem, atividade

**Bot responsável**:
O Bot que responde pela conclusão de uma Tarefa. A responsabilidade muda somente por uma transferência visível na conversa.
_Evitar_: Colaborador, executor ocasional

**Colaborador**:
Um Bot que ajuda numa Tarefa sem se tornar o Bot responsável.
_Evitar_: Corresponsável, novo responsável

**Ação interna**:
Uma ação que organiza ou produz trabalho dentro do Time sem alterar um sistema externo. O Líder pode executar e delegar Ações internas sem aprovação.
_Evitar_: Ação externa

**Ação externa**:
Uma ação que altera algo fora do Time, como enviar, publicar, comprar ou apagar. Ela exige aprovação quando ultrapassa o limite definido pela pessoa.
_Evitar_: Rascunho, análise, Ação interna

**Limite de aprovação**:
A regra definida pela pessoa que determina quais Ações externas um Bot pode executar sem pedir autorização naquele momento.
_Evitar_: Permissão da Conexão, instrução do Líder

**Acesso do Bot**:
A autorização para um Bot usar uma Conexão. Remover o acesso não remove a Conexão nem o Bot.
_Evitar_: Cópia de credencial, API key do Bot
