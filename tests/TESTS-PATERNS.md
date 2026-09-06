# Padrões de testes

## Organização

Agrupe os cenários em `tests/` pelo comportamento que a interface de `src/` possui, mantendo os nomes do domínio. A estrutura não exige um arquivo de teste para cada arquivo de produção.

Importe o aplicativo por `@src/*`. Coloque suporte compartilhado em `tests/support/` apenas quando mais de um arquivo precisar dele.

## Comandos

Use a versão do Bun declarada em `package.json`, também usada no CI.

```sh
bun run test
bun run check
bun run build
```

`test` executa `tests/` com um contexto global isolado por arquivo, sem paralelismo entre arquivos. `--no-orphans` encerra processos descendentes quando o runner termina. Isso não isola recursos externos; cada caso continua responsável por seus dados e cleanup.

`check` executa lint, typecheck e análise de código não usado. Ele pode aplicar correções: inspecione o diff resultante e reexecute os checks afetados. Não precisa rodar `typecheck` separadamente depois de um `check` bem-sucedido. O lint rejeita testes com `.only`.

Para rodar um arquivo isoladamente:

```sh
bun test ./tests/engine/conversation-messages.test.ts --isolate --no-orphans
```

Para investigar riscos de ordem ou agendamento:

```sh
bun run test:stress
```

Esse comando varia a ordem e repete cada arquivo três vezes. Também é possível acrescentar `--randomize --rerun-each 3` ao comando focado. Quando falhar, preserve o alvo e as opções usados e acrescente `--seed=<seed exibida>` para reproduzir a ordem. A seed não reproduz o agendamento de processos ou a latência do sistema.

O runner não compila o Engine. Cenários que executarem `dist-engine/mimo-engine` precisam de `bun run build:engine` antes. O CI de PR executa o build antes da suíte.

## Estado e recursos

- Para persistência, use um banco local descartável por caso com o schema real. Nunca reutilize `.mimo-dev/`, `.mimo-load/` ou dados pessoais.
- Aguarde `observability.flush()` e feche o banco antes de remover o diretório temporário. Um hook de limpeza registrado antes pode apagar os arquivos enquanto esses recursos ainda estão ativos.
- Use `setSystemTime` para regras de data e restaure o relógio depois. Ele não avança timers.
- Use `test.each` para entradas da mesma regra com resultados relevantes distintos.
- Mantenha a execução sequencial enquanto houver estado global ou recursos compartilhados. Não ative `--concurrent` para toda a suíte.

## Desempenho

Os comandos `seed:load`, `dev:load` e `bench:*` exercitam o produto com dados de carga; o [AGENTS.md](../AGENTS.md#desempenho) descreve os cenários e o ambiente necessário para cada medição.
