# Código

Todo agente que escrever ou alterar código deve usar o Skill tool com name `code-practices` e o Skill tool com name `codebase-design` antes de agir. As duas chamadas são obrigatórias mesmo em mudanças pequenas.

# Testes

Leia `tests/TESTS-PATERNS.md` antes de criar ou alterar testes. Ele registra a estrutura, os comandos e os recursos do Bun adotados pela suíte.

# Renderer

Leia `src/renderer/RENDERER-PATERNS.md` antes de criar ou alterar código no Renderer. Ele registra as escolhas de React e estado da interface.

# Desempenho

Para medir a interface com histórico pesado: `bun run seed:load` cria `.jolt-load/` com Bots de 40 a 3000 mensagens, `bun run dev:load` abre o app nesse banco e `bun run bench:open` conecta pela porta CDP 9222, abre cada conversa e imprime p50 e p95 do span `renderer.conversationopen`. Os spans ficam em `.jolt-load/logs/observations.jsonl`. `bun run bench:turn` envia uma mensagem, grava um perfil de CPU do renderer e imprime o tempo ocupado da thread principal durante o turno; ele precisa do Provider de carga, que `dev:load` liga com `JOLT_LOAD_PROVIDER=true` e responde um turno roteirizado sem chamar um modelo. Para o número de produção, rode `bun run build` e `JOLT_USER_DATA=$PWD/.jolt-load JOLT_LOAD_PROVIDER=true ./node_modules/.bin/electron .` no lugar de `dev:load`. `bun run bench:boot` abre e fecha o app compilado cinco vezes e imprime, por rodada, o tempo do spawn até o Main começar, a duração de `main.startup`, a de `engine.startup` e o tempo do spawn até o primeiro RPC do Renderer; ele precisa de `bun run build` antes e não precisa do app aberto. `bun run bench:typing` digita uma frase no composer de Média em três rodadas, primeiro com o app parado e depois enquanto Leve responde um turno do Provider de carga, e imprime o atraso do keydown, o tempo até a pintura seguinte e os frames longos; o composer do Bot que responde fica desabilitado, então a digitação durante o streaming só acontece em outro Bot. `bun run bench:scroll` rola Leve e Enorme para cima, revela 200 mensagens anteriores e rola de novo, e imprime os frames lentos e o frame mais longo com a parte de script e de renderização. Os dois usam `bench/page-probe.ts`, que instala na página um contador de frames, um observador de `long-animation-frame` e um listener de keydown. O scroll é feito de dentro da página com `scrollBy`, porque o wheel enviado pelo CDP chega como evento mas o Chromium do Electron não rola; a digitação usa `press` por tecla, porque `keyboard type` insere texto sem eventos de tecla e `press` não insere acentos.
