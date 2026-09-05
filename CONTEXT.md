# Bots locais

Este contexto define como uma pessoa cria Bots, conversa com eles e permite que coordenem outros Bots.

## Linguagem

**Bot**:
Um participante com identidade, Função, contexto, memória e histórico próprios. A pessoa cria um Bot apenas com o nome e pode definir sua Função depois; um Bot pode existir sem pertencer a um Projeto ou Time.
_Evitar_: Agente, assistente

**Líder**:
Um Bot que possui ao menos um Integrante e responde pelo trabalho deles. Remover o último Integrante faz com que ele volte a ser apenas um Bot.
_Evitar_: Orquestrador, bot principal

**Integrante**:
Um Bot ligado a um único Líder, com Função, memória e histórico próprios. A pessoa o cria ou o Líder o contrata. Um Integrante pode ter Colegas, mas não pode ser Colega de ninguém.
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

**Colega**:
Um Bot sem Líder que outro Bot pode chamar por uma Tarefa. A ligação vale numa direção só e não cria hierarquia: o Colega mantém Função, Memória, Permissão e Acessos próprios.
_Evitar_: Contato, Integrante, parceiro

**Fila**:
As mensagens que a pessoa escreveu enquanto o Bot trabalha e que aguardam a vez. Elas ficam no Engine, na ordem em que foram escritas, e entram no Turno seguinte quando o atual termina por conta própria. Interromper ou uma falha preservam a Fila.
_Evitar_: Buffer, rascunho, pendências

**Adiantar**:
Entregar uma mensagem ao Bot dentro do Turno em andamento. O Bot a recebe entre uma ferramenta e a próxima decisão, sem perder o trabalho já feito. Difere de Interromper, que encerra o Turno.
_Evitar_: Steer, forçar, priorizar

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
A seleção temporária de informações usadas num Turno. Inclui a Origem, o momento e, quando existem, a Rotina, o Gatilho ou a Tarefa que iniciou o Turno.
_Evitar_: Memória, histórico completo, prompt permanente

**Turno**:
Uma execução conversacional do Bot iniciada por uma mensagem da pessoa, uma Chamada, um Disparo, uma Tarefa ou um Resultado da Tarefa.
_Evitar_: Ativação, rodada, run

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
A passagem em que o Jolt entrega as Notas pendentes ao Bot e ele cria, substitui ou esquece Lembranças, considerando a origem e a confirmação do conteúdo; uma inferência do Bot não substitui uma declaração da pessoa apenas por ser mais recente. Acontece fora da Conversa, quando o Bot está livre, e respeita o Limite da Memória.
_Evitar_: Dreaming, consolidação, compactação, resumo

**Origem**:
De onde um Turno, uma Nota ou uma Lembrança veio: da pessoa, de uma Rotina, de um Gatilho ou de outro Bot. O Jolt inclui a Origem no Contexto e a registra; o Bot não a escreve.
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

**Mensagem**:
Um envio deliberado e persistido na Conversa do Bot, materializado exclusivamente a partir do conteúdo passado a `send_message`. Um Turno pode produzir várias Mensagens; texto comum do Fornecedor não aparece na Conversa.
_Evitar_: Turno, Atividade, fragmento de streaming

**Pergunta**:
Uma Mensagem final em que o Bot apresenta opções conhecidas e espera a escolha da pessoa antes de continuar. A Pergunta encerra o Turno e não substitui um Pedido de permissão ou Pedido de Plugin.
_Evitar_: Formulário, Pedido de permissão, interrupção

**Resposta**:
Uma Mensagem da pessoa que escolhe uma Opção de uma Pergunta e inicia um novo Turno. Ela preserva o vínculo com a Pergunta mesmo depois que a Conversa é reaberta.
_Evitar_: Decisão, retorno da ferramenta

**Opção**:
Uma escolha estruturada e persistida dentro de uma Pergunta, com valor estável, rótulo e uma descrição opcional.
_Evitar_: Ação, botão, item do select

**Abertura**:
A primeira Mensagem de um trabalho com ações. Confirma o que o Bot entendeu e nomeia o primeiro passo antes de qualquer ferramenta executar.
_Evitar_: Resultado, status genérico

**Atividade**:
O registro do pensamento exposto pelo Fornecedor do Bot e das ações executadas por um Bot, separado da conversa.
_Evitar_: Mensagem, pensamento não exposto, raciocínio

**Detalhes do trabalho**:
A exibição da Atividade na Conversa. A pessoa escolhe uma preferência única para o Jolt, desligada por padrão. Desligar oculta a Atividade sem apagá-la; durante um Turno em andamento, uma animação sem texto indica que o Bot continua trabalhando.
_Evitar_: Passos do agente, apagar Atividade, Mensagem

**Duração do pensamento**:
A soma dos períodos em que o Fornecedor do Bot sinaliza pensamento durante uma execução. Ela só existe quando o Fornecedor expõe esse estado.
_Evitar_: Tempo até a primeira resposta, duração total da execução

**Esforço**:
Quanto um Bot pensa antes de agir: baixo, médio, alto, muito alto ou máximo. A pessoa escolhe por Bot, e a escolha vale para toda Conversa, Tarefa e Chamada até ela mudar.
_Evitar_: Nível de pensamento, reasoning, raciocínio, modelo

**Modelo**:
A variante do Fornecedor do Bot que executa o trabalho, como um modelo específico dentro do Codex. A pessoa escolhe por Bot; sem escolha, o Bot usa o padrão do Fornecedor.
_Evitar_: Fornecedor, Conexão, versão

**Permissão do Bot**:
O modo que decide se um Bot pode agir sozinho, deve pedir uma Decisão ou fica limitado à leitura. A pessoa escolhe entre Somente leitura, Perguntar e Acesso total por Bot. Somente leitura permite ler, listar e pesquisar dentro da Pasta de trabalho; Perguntar permite essas leituras e pede uma Decisão antes das demais ferramentas ou de uma leitura externa; Acesso total não pede. Chamar um Integrante ou um Colega nunca pede Decisão: vale a Permissão do Bot chamado.
_Evitar_: Sandbox, acesso ao computador, autonomia

**Pedido de permissão**:
Uma solicitação feita durante a Conversa antes de o Bot usar uma ferramenta sujeita à Permissão do Bot. Cada Pedido autoriza ou nega uma única chamada; a Nota também pede, mas a Curadoria não.
_Evitar_: Confirmação, consentimento permanente, aprovação da Curadoria

**Decisão**:
A resposta da pessoa a um Pedido de permissão: Permitir ou Negar.
_Evitar_: Grant, autorização permanente

**Comando**:
Uma instrução que a pessoa digita na Conversa começando com `/` e que age sobre o Bot em vez de virar Mensagem. Executar limpa o que foi digitado; `/lembrar` cria uma Lembrança e `/compactar` resume o Contexto atual sem alterar a Conversa ou a Memória, com instruções opcionais de foco.
_Evitar_: Atalho, slash command, ação rápida

**Menção**:
O nome de um Bot que a pessoa escolhe com `@` ao escrever uma Mensagem, e que o torna Colega do Bot com quem ela conversa. É a única forma de apresentar um Bot a outro; a pessoa revoga nas configurações do Bot.
_Evitar_: Marcação, tag, Comando

**Tarefa**:
Um trabalho com resultado esperado e um único Bot responsável. Um Líder abre uma Tarefa para um Integrante, e um Bot abre uma Tarefa para um Colega.
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

**Evento externo**:
Um fato que um Plugin entrega ao Jolt, como a abertura de uma issue no GitHub. Receber um Evento externo não chama um Bot por si só.
_Evitar_: Gatilho, Disparo, mensagem

**Gatilho**:
Uma regra persistida de um Bot que combina uma Conta, um tipo de Evento externo, condições estruturadas e a instrução do trabalho. Somente um Evento externo que combina com a regra produz um Disparo.
_Evitar_: Rotina, webhook, automação, condição em texto livre

**Disparo**:
Uma ocorrência persistida em que um Evento externo combinou com um Gatilho. O Disparo espera o Bot ficar livre e inicia um Turno uma única vez.
_Evitar_: Chamada, Evento externo, execução, webhook

**Plugin**:
Um serviço externo que o Jolt sabe usar, como o Gmail, já embutido, ou um servidor MCP que a pessoa adiciona com um comando. Um Plugin define as ferramentas; as credenciais ficam na Conta.
_Evitar_: Integração, conector, extensão, MCP como sinônimo de Plugin

**Conta**:
Uma credencial conectada a um Plugin, guardada cifrada no computador da pessoa, como um endereço do Gmail ou as variáveis de um servidor MCP. Um Plugin pode ter várias Contas; um servidor MCP tem exatamente uma, criada ao adicionar o Plugin. Uma Conta pode Precisar autenticar de novo sem perder os Acessos.
_Evitar_: Conexão, credencial, login, token

**Acesso**:
A ligação entre um Bot e uma Conta. Um Bot pode ter Acesso a várias Contas do mesmo Plugin. A pessoa concede nas configurações do Bot, ou na Conversa quando o Bot pede pelo Pedido de Plugin. A Permissão do Bot vale para as ferramentas do Plugin como para as demais. Um Integrante temporário recebe só os Acessos que o Líder passa ao contratar.
_Evitar_: Grant, vínculo, permissão do Plugin

**Conta escolhida**:
A Conta que o Bot indica ao chamar uma ferramenta do Plugin. Com um único Acesso ao Plugin, o Bot usa essa Conta diretamente, sem perguntar qual usar. Com mais de um, o Bot indica pelo rótulo a Conta escolhida pela pessoa ou clara pelo contexto; se a escolha for ambígua, apresenta as Contas em uma Pergunta antes de agir.
_Evitar_: Conta padrão, Conta ativa, sessão

**Pedido de Plugin**:
Uma solicitação feita durante a Conversa quando o Bot precisa de um Plugin sem Acesso, quando a Conta precisa autenticar de novo ou quando falta acesso ao recurso solicitado. Quando há um alvo verificável, como um repositório do GitHub, o pedido preserva esse alvo, usa um Acesso adequado já concedido ou apresenta uma ação para liberá-lo. O Bot só continua com acesso confirmado; uma conexão concluída sem o recurso não significa sucesso. A pessoa pode cancelar. Ele não passa por Pedido de permissão: pedir o Plugin já é a pergunta.
_Evitar_: Pedido de permissão, autorização, OAuth

**Pesquisa web**:
A capacidade de todo Bot de procurar informação na internet e ler uma página, sem Plugin, sem Conta e sem configuração. Não passa por Pedido de permissão, porque só lê. Um Bot com Permissão somente leitura não a tem.
_Evitar_: Busca, navegação, Plugin de pesquisa

**Navegador do Bot**:
A página de trabalho de um Bot nos sites, visível à pessoa em uma prévia. Cada Bot mantém sua página; os logins dos sites são compartilhados e permanecem salvos entre usos do Jolt.
_Evitar_: Plugin, Pesquisa web

**Assumir o navegador**:
A pessoa escolhe Assumir controle e passa a usar o site enquanto o Bot espera. Voltar ao chat recolhe o navegador e mantém o controle com a pessoa; Devolver para o Bot indicado permite que ele continue e mantém a visualização aberta.
_Evitar_: Interromper, Adiantar

**Acompanhar o navegador**:
A pessoa amplia a prévia para assistir à página enquanto o Bot continua no controle. A visualização não permite interagir com o site; Voltar ao chat apenas a recolhe.
_Evitar_: Assumir, Pausar
