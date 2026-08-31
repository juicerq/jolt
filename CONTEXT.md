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
Um Bot ligado a um único Líder, com Função, memória e histórico próprios.
_Evitar_: Subagente, bot secundário, especialista

**Bot temporário**:
Um Integrante criado para uma única Tarefa. Ele perde seus acessos e sua memória ao encerrar, enquanto seu histórico permanece ligado à Tarefa.
_Evitar_: Integrante permanente, subprocesso

**Time**:
A forma informal de chamar um Líder e seus Integrantes. Time não é uma entidade separada.
_Evitar_: Objeto Time, grupo obrigatório

**Projeto**:
Um agrupamento opcional de Bots que compartilham um trabalho e uma Pasta de trabalho padrão. Todo Projeto possui uma Pasta de trabalho, mas um Bot pode substituí-la. Um Líder e seus Integrantes permanecem no mesmo Projeto; mover o Líder move o Time inteiro.
_Evitar_: Time, codebase, pasta de Bots

**Diretório do Bot**:
O espaço privado pertencente a um Bot, onde ficam sua memória e seus próprios arquivos. Ele não muda quando o Bot troca de Projeto ou de Pasta de trabalho.
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
O conhecimento persistente ligado à Função de um Bot.
_Evitar_: Contexto, histórico

**Conversa do Bot**:
A linha cronológica das mensagens trocadas pelo Bot com a pessoa, o Líder e outros Bots.
_Evitar_: Log interno, raciocínio

**Atividade**:
O registro do raciocínio exposto pelo Fornecedor do Bot e das ações executadas por um Bot, separado da conversa.
_Evitar_: Mensagem, raciocínio não exposto

**Duração do raciocínio**:
A soma dos períodos em que o Fornecedor do Bot sinaliza raciocínio durante uma execução. Ela só existe quando o Fornecedor expõe esse estado.
_Evitar_: Tempo até a primeira resposta, duração total da execução

**Tarefa**:
Um trabalho com resultado esperado e um único Bot responsável.
_Evitar_: Mensagem, atividade

**Conexão por Assinatura**:
Uma Conexão que usa a sessão oficial já autenticada pela pessoa no Codex ou no Claude Code.
_Evitar_: BYOK, API key do modelo

**Execução local**:
O trabalho de um Bot realizado na máquina da pessoa.
_Evitar_: Execução remota, execução em VPS
