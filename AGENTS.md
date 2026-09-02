# Código

Todo agente que escrever ou alterar código deve usar o Skill tool com name `code-practices` e o Skill tool com name `codebase-design` antes de agir. As duas chamadas são obrigatórias mesmo em mudanças pequenas.

# Testes

Leia `tests/TESTS-PATERNS.md` antes de criar ou alterar testes. Ele registra a estrutura, os comandos e os recursos do Bun adotados pela suíte.

# Renderer

Leia `src/renderer/RENDERER-PATERNS.md` antes de criar ou alterar código no Renderer. Ele registra as escolhas de React e estado da interface.

# Desempenho

Para medir a interface com histórico pesado: `bun run seed:load` cria `.jolt-load/` com Bots de 40 a 3000 mensagens, `bun run dev:load` abre o app nesse banco e `bun run bench:open` conecta pela porta CDP 9222, abre cada conversa e imprime p50 e p95 do span `renderer.conversationopen`. Os spans ficam em `.jolt-load/logs/observations.jsonl`. Para o número de produção, rode `bun run build` e `JOLT_USER_DATA=$PWD/.jolt-load ./node_modules/.bin/electron .` no lugar de `dev:load`.
