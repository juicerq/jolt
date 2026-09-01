# Bots locais

Este contexto define como uma pessoa cria Bots, conversa com eles e permite que coordenem outros Bots.

## Linguagem

**Bot**:
Um participante com identidade, Função, contexto, memória e histórico próprios. Um Bot pode existir sem pertencer a um Projeto ou Time.
_Evitar_: Agente, assistente

**Líder**:
Um Bot que possui ao menos um Integrante e responde pelo trabalho deles. Remover o último Integrante faz com que ele volte a ser apenas um Bot.
_Evitar_: Orquestrador, bot principal

**Integrante**:
Um Bot ligado a um único Líder, com Função, memória e histórico próprios. A pessoa o cria ou o Líder o contrata.
_Evitar_: Subagente, bot secundário, especialista

**Integrante temporário**:
Um Integrante que o Líder contrata para uma única Tarefa. Ele herda a pasta e o executor do Líder, não cria Bots e fica encerrado quando a Tarefa termina: não recebe novas mensagens, e seu histórico permanece ligado à Tarefa. Os demais Integrantes são permanentes.
_Evitar_: Bot temporário, subprocesso

**Encerrado**:
O estado de um Integrante temporário cuja Tarefa terminou.
_Evitar_: Removido, arquivado, deletado

**Excluir**:
Apagar um Bot de forma definitiva, junto com sua Conversa, sua Memória e seu Diretório. Excluir um Líder exclui também seus Integrantes. Um Bot que está trabalhando é interrompido antes de ser excluído. Difere de Encerrado, que preserva o histórico.
_Evitar_: Remover, deletar, encerrar, arquivar

**Time**:
A forma informal de chamar um Líder e seus Integrantes. Time não é uma entidade separada.
_Evitar_: Objeto Time, grupo obrigatório

**Projeto**:
Um agrupamento opcional de Bots que compartilham um trabalho e uma Pasta de trabalho padrão. Todo Projeto possui uma Pasta de trabalho, mas um Bot pode substituí-la. Um Líder e seus Integrantes permanecem no mesmo Projeto; mover o Líder move o Time inteiro.
_Evitar_: Time, codebase, pasta de Bots

**Diretório do Bot**:
O espaço privado pertencente a um Bot, onde ficam seus próprios arquivos. Ele não muda quando o Bot troca de Projeto ou de Pasta de trabalho.
_Evitar_: Pasta de trabalho, pasta do Projeto

**Pasta de trabalho**:
O local em que um Bot é iniciado e realiza seu trabalho. Ela pode ser escolhida pelo Bot, herdada de seu Projeto ou, na ausência das duas, ser o próprio Diretório do Bot.
_Evitar_: Diretório do Bot, memória, Projeto

**Fornecedor do Bot**:
O agente compatível, como Codex ou Claude Code, escolhido para executar o trabalho de um Bot.
_Evitar_: Modelo, Conexão, troca automática

**Função do Bot**:
O contrato permanente que define o resultado esperado, as responsabilidades, os limites e a forma de entrega de um Bot.
_Evitar_: Personalidade, prompt, memória, acesso

**Contexto do Bot**:
A seleção temporária de informações usadas numa execução.
_Evitar_: Memória, histórico completo, prompt permanente

**Memória do Bot**:
A lista de Lembranças de um Bot. Pequena e sempre presente no Contexto. A pessoa liga, desliga e limpa a Memória por Bot. Um Integrante lê também a Memória do seu Líder. Um Integrante temporário não tem Memória própria.
_Evitar_: Contexto, histórico, Notas

**Lembrança**:
Um item da Memória. Uma frase que o Bot deve saber em toda execução. Tem Origem e data. A Curadoria cria, substitui e esquece Lembranças; a pessoa cria, esquece e limpa.
_Evitar_: Fato, entrada, item, memória

**Nota**:
Um registro curto que o Bot escreve durante o trabalho para a Curadoria avaliar. Uma Nota nunca entra no Contexto. Ela guarda a Origem do turno em que nasceu.
_Evitar_: Memória, log, diário, rascunho

**Curadoria**:
A passagem em que o Jolt entrega as Notas pendentes ao Bot e ele cria, substitui ou esquece Lembranças. Acontece fora da Conversa, quando o Bot está livre. Respeita o Limite da Memória.
_Evitar_: Dreaming, consolidação, compactação, resumo

**Origem**:
De onde uma Nota ou Lembrança veio: da pessoa, ou do Bot durante uma conversa, uma Tarefa ou uma Chamada. O Jolt registra a Origem; o Bot não a escreve.
_Evitar_: Fonte, autor, proveniência

**Limite da Memória**:
O tamanho máximo da Memória de um Bot. Uma Lembrança que não cabe é recusada até o Bot esquecer ou substituir outra.
_Evitar_: Budget, cota, orçamento

**Esquecer**:
Apagar uma Lembrança. A pessoa ou a Curadoria esquece.
_Evitar_: Remover, deletar, excluir

**Limpar a Memória**:
Esquecer todas as Lembranças e Notas de um Bot de uma vez.
_Evitar_: Resetar, apagar tudo, excluir

**Memória desligada**:
O estado em que o Bot não lê nem escreve Memória, própria ou do Líder. Nada é apagado. Religar devolve tudo.
_Evitar_: Pausada, arquivada

**Memória do Time**:
A forma informal de chamar a Memória do Líder vista pelos Integrantes. Não é uma lista separada e some para o Time quando a Memória do Líder está desligada.
_Evitar_: Memória compartilhada, memória do Projeto

**Conversa do Bot**:
A linha cronológica das mensagens trocadas pelo Bot com a pessoa, o Líder e outros Bots.
_Evitar_: Log interno, pensamento, raciocínio

**Atividade**:
O registro do pensamento exposto pelo Fornecedor do Bot e das ações executadas por um Bot, separado da conversa.
_Evitar_: Mensagem, pensamento não exposto, raciocínio

**Duração do pensamento**:
A soma dos períodos em que o Fornecedor do Bot sinaliza pensamento durante uma execução. Ela só existe quando o Fornecedor expõe esse estado.
_Evitar_: Tempo até a primeira resposta, duração total da execução

**Tarefa**:
Um trabalho com resultado esperado e um único Bot responsável.
_Evitar_: Mensagem, atividade

**Resultado da Tarefa**:
O que o Bot responsável entrega ao concluir uma Tarefa.
_Evitar_: Resposta, retorno, output

**Conexão por Assinatura**:
Uma Conexão que usa a sessão oficial já autenticada pela pessoa no Codex ou no Claude Code.
_Evitar_: BYOK, API key do modelo

**Execução local**:
O trabalho de um Bot realizado na máquina da pessoa.
_Evitar_: Execução remota, execução em VPS

**Rotina**:
Um pedido fixo que o Jolt entrega a um Bot na Frequência escolhida. Pertence a um único Bot, que pode ter várias. A pessoa ou o próprio Bot cria, altera, pausa e remove uma Rotina. Um Integrante temporário não tem Rotina.
_Evitar_: Cron, agendamento, gatilho, job, timer

**Frequência**:
Quando uma Rotina chama o Bot. Ela tem três formas: Intervalo, a cada tantos minutos; Horário fixo, em dias da semana e hora local escolhidos; ou Uma vez, em uma data e hora local. Uma Rotina de uma vez some sozinha depois da Chamada.
_Evitar_: Cron, expressão, agenda, schedule

**Chamada**:
Cada mensagem que uma Rotina entrega ao seu Bot. Ela entra na Conversa do Bot com autor próprio. Um Bot que já está trabalhando não recebe a Chamada; ela fica para a próxima Frequência. Uma Chamada perdida enquanto o Jolt estava fechado acontece uma única vez ao abrir.
_Evitar_: Tick, execução, disparo, mensagem da pessoa
