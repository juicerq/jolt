---
name: testing
description: Selecionar, escrever e revisar testes permanentes do Jolt no fechamento de features e correções, ou quando o usuário pedir trabalho em testes.
---

# Testes do Jolt

Use esta skill no momento definido pelo [AGENTS.md](../../../AGENTS.md). Leia o [guia local](../../../tests/TESTS-PATERNS.md) para executar testes e escolher recursos do Bun. A etapa pode terminar sem testes novos.

## Selecionar pelo risco

Leia o diff, os critérios de aceite, a interface afetada e a proteção existente. Para cada candidato, identifique a falha concreta, o impacto e o resultado esperado. A expectativa vem do pedido ou de um contrato confirmado; a resposta atual da implementação não estabelece o comportamento correto.

Adicione apenas proteção relevante que ainda falta. Estenda um cenário existente quando ele cobrir o mesmo contrato com clareza. Não escreva um teste por função, arquivo, branch ou percentual de cobertura. Não duplique o mesmo risco em várias camadas sem identificar a falha diferente que cada uma detecta.

## Escrever pela interface

Chame a interface usada pelo produto, na menor fronteira que contenha o risco. Mantenha módulos internos reais. Para persistência e concorrência, exercite o banco local real e isolado; um banco falso não prova queries, transações ou constraints.

Controle sistemas externos na fronteira. Use respostas pequenas que preservem as semânticas relevantes de sucesso, erro e conclusão. Não replique um fornecedor inteiro nem chame um LLM real na suíte. A compatibilidade com o fornecedor exige evidência de contrato ou execução controlada separada.

Verifique resultados e efeitos observáveis. Não exporte helpers privados para testá-los, copie o algoritmo para calcular a expectativa ou teste o texto do código-fonte. Chamadas internas não são o contrato. A contagem de um efeito externo pode ser: duas solicitações não devem gerar dois uploads quando a operação é idempotente.

Prepare só os dados exigidos pelo caso. Crie suporte compartilhado quando houver uso real e uma responsabilidade clara. Não introduza um framework de fixtures ou uma nova abstração no produto só para facilitar mocks.

## Verificar frontend

Mudanças de interface exigem verificar o resultado renderizado nos estados afetados, incluindo largura estreita e foco quando pertinentes. Acrescente testes permanentes para comportamentos relevantes que atravessem a UI, como envio pelo teclado, rascunho por conversa e composer editável durante streaming.

Mudança de espaçamento, cor, borda ou alinhamento, por si só, não exige teste novo. Não teste strings de classes CSS nem grandes snapshots de componentes. Compare screenshots automaticamente apenas quando houver apresentação estável ou regressão visual recorrente que justifique controlar fontes, dados, animações e ambiente. Revise cada diferença antes de atualizar a referência.

Use os benchmarks existentes para riscos de latência, scroll e memória, com ambiente e linha de base comparáveis. Não converta essas medições em limites de milissegundos na suíte funcional.

## Isolar e sincronizar

Cada caso começa com estado próprio. Isole também bancos, diretórios, portas e outros recursos fora do processo. Encerre recursos e restaure mudanças globais no escopo que os criou, mesmo quando a asserção falhar. Não dependa da ordem dos testes.

Controle datas e aleatoriedade quando determinarem o resultado. Espere promessas, eventos ou condições observáveis com prazo; não use sleep fixo como sinal de conclusão. Para verificar ausência de um efeito, aguarde o término do trabalho que poderia produzi-lo. Coordene disputas de concorrência com sinais explícitos.

## Demonstrar a detecção

Para um bug, execute o cenário contra a versão defeituosa compatível. Para comportamento novo, introduza localmente a regressão específica que o teste promete detectar. Confirme que falha pela asserção esperada, restaure a implementação e execute de novo. Erro de importação ou de setup não demonstra detecção. Preserve mudanças alheias e não entregue a regressão temporária.

Se essa demonstração não for viável, registre o motivo e a lacuna para revisão; não declare uma prova que não executou. Não transforme essa etapa em uma infraestrutura obrigatória de mutation testing.

Execute o caso focado e a suíte pertinente. Para riscos de ordem ou agendamento, faça repetição limitada com ordem variada, preservando a seed e as opções de isolamento. Repetição sem falhas fornece evidência limitada, não garantia de estabilidade.

## Resolver falhas

Investigue teste, produto e ambiente. Corrija a causa; não enfraqueça a asserção, aumente timeout, ative retry ou aplique skip para obter verde. Um teste novo flaky não entra na suíte.

Quarentena de teste existente exige decisão explícita com responsável, issue, prazo e risco descoberto. Não conta como proteção. Sem mecanismo que torne sua expiração bloqueante, não introduza quarentena.

Remova um teste quando o contrato sair do produto, outro cenário passar a protegê-lo ou a proteção não justificar permanência. Explique a decisão com base no comportamento, não no tamanho do arquivo.

## Fechar

Revise o diff dos testes e remova a duplicação criada pela mudança. Se um teste revelar defeito, corrija a implementação e revalide os checks afetados antes da entrega.

Informe brevemente o risco protegido, a detecção demonstrada, os comandos e resultados reais e as limitações relevantes. Quando não houver teste novo, explique a verificação suficiente ou a lacuna que exige decisão. Não crie um relatório separado obrigatório.
