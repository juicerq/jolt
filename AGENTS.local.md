# Ambientes do Mimo

Qualquer agent que interagir com o Mimo deve usar sempre a instância `mimo-dev`, com dados em `~/.config/mimo-dev`, identificada como **Mimo Dev** e exposta para automação em `127.0.0.1:9222`. Toda criação ou alteração de Bots, Times, Rotinas, Plugins, configurações ou conteúdo acontece somente nela, independentemente do cenário.

`.mimo-load` contém dados sintéticos de desempenho (Bots Leve, Média, Pesada, Enorme, Coordenador, Pesquisador e Redator) e não é alvo de trabalho de agents. Os próprios comandos `bench:*` podem controlá-la na porta `9223` somente para executar suas medições; nenhuma mudança solicitada pela pessoa deve ser feita nela.
