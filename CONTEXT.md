# Bots locais

Este contexto define como uma pessoa cria Bots persistentes, conversa com eles e permite que coordenem outros Bots.

## Linguagem

**Bot**:
Um participante persistente com identidade, Função, contexto, memória e histórico próprios. Um Bot existe sem pertencer a um Time.
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
O registro de ações executadas por um Bot, separado da conversa.
_Evitar_: Mensagem, raciocínio interno

**Tarefa**:
Um trabalho com resultado esperado e um único Bot responsável.
_Evitar_: Mensagem, atividade

**Conexão por Assinatura**:
Uma Conexão que usa a sessão oficial já autenticada pela pessoa no Codex ou no Claude Code.
_Evitar_: BYOK, API key do modelo

**Execução local**:
O trabalho de um Bot realizado na máquina da pessoa.
_Evitar_: Execução remota, execução em VPS
