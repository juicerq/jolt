# Padrões de testes

O [AGENTS.md](../AGENTS.md) define quando adicionar testes. A [skill testing](../.agents/skills/testing/SKILL.md) define os critérios de admissão e revisão. Este arquivo registra a execução e os recursos específicos do Jolt.

## Organização

Agrupe os cenários em `tests/` pelo comportamento que a interface de `src/` possui, mantendo os nomes do domínio. A estrutura não exige um arquivo de teste para cada arquivo de produção.

Importe o aplicativo por `@src/*`. Use `*.test.ts` ou `*.test.tsx`. Coloque suporte compartilhado em `tests/support/` apenas quando mais de um arquivo precisar dele.

## Comandos

Use a versão do Bun declarada em `package.json`, também usada no CI.

```sh
bun run test
bun run check
bun run build
```

`test` executa `tests/` com um contexto global isolado por arquivo, sem paralelismo entre arquivos. `--no-orphans` encerra processos descendentes quando o runner termina. Isso não isola recursos externos; cada caso continua responsável por seus dados e cleanup.

A suíte começa sem casos permanentes. Os scripts aceitam essa condição com `--pass-with-no-tests`, e o Bun informa que não encontrou testes. Ao admitir o primeiro caso permanente, retire essa opção de `test` e `test:stress` no mesmo diff, para que a perda da suíte não passe silenciosamente.

`check` executa lint, typecheck e análise de código não usado. Ele pode aplicar correções: inspecione o diff resultante e reexecute os checks afetados. Não precisa rodar `typecheck` separadamente depois de um `check` bem-sucedido. O lint rejeita testes com `.only`.

Para retorno focado, substitua o caminho abaixo por um arquivo existente:

```sh
bun test ./tests/engine/conversations.test.ts --isolate --no-orphans
```

Para investigar riscos de ordem ou agendamento:

```sh
bun run test:stress
```

Esse comando varia a ordem e repete cada arquivo três vezes. Também é possível acrescentar `--randomize --rerun-each 3` ao comando focado. Quando falhar, preserve o alvo e as opções usados e acrescente `--seed=<seed exibida>` para reproduzir a ordem. A seed não reproduz o agendamento de processos ou a latência do sistema.

O runner não compila o Engine. Cenários que executarem `dist-engine/jolt-engine` precisam de `bun run build:engine` antes. O CI de PR executa o build antes da suíte.

## Estado e recursos

- Para arquivos temporários, o helper `tests/support/test-directory.ts` cria um caminho exclusivo por arquivo e recria seu conteúdo entre casos. Ele pressupõe testes sequenciais dentro do arquivo.
- Para persistência, use um banco local descartável por caso com o schema real. Nunca reutilize `.jolt-dev/`, `.jolt-load/` ou dados pessoais.
- Termine servidores, subprocessos, bancos e streams no escopo que os abriu, mesmo quando houver falha.
- Aguarde escritas assíncronas, inclusive `observability.flush()`, antes de terminar o caso.
- Use `setSystemTime` para regras de data e restaure o relógio depois. Ele não avança timers.
- Use `test.each` para entradas da mesma regra com resultados relevantes distintos.
- Mantenha a execução sequencial enquanto houver estado global ou recursos compartilhados. Não ative `--concurrent` para toda a suíte.
- Configure timeout próprio somente quando a operação tiver um limite real que justifique a diferença; preserve diagnóstico ao excedê-lo.
- Não configure retries no runner, no arquivo de configuração ou nas opções de um caso.
- Prefira expectativas explícitas. Use snapshot apenas quando o valor inteiro for um contrato pequeno e revisável.

## Interface e desempenho

Leia `src/renderer/RENDERER-PATERNS.md` antes de alterar código do Renderer. Verifique o resultado renderizado com `agent-browser` e os estados relevantes. A skill testing define quando essa verificação merece virar um teste permanente.

Os comandos `seed:load`, `dev:load` e `bench:*` já exercitam o produto com dados de carga; o [AGENTS.md](../AGENTS.md#desempenho) descreve seus cenários. Use-os apenas quando pertinentes. Confira que o processo usa o checkout e os dados pretendidos. Portas, bancos e logs desses comandos também precisam ser exclusivos quando outro trabalho estiver em execução.
