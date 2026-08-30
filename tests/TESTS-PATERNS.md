# Padrões de testes

Leia este arquivo antes de criar ou alterar testes.

## Estrutura

`tests/` repete a árvore de `src/`. Um teste fica no mesmo caminho do módulo que ele cobre.

Importe código do aplicativo por `@src/*`. Coloque código usado apenas por testes em `tests/support/` quando mais de um arquivo precisar dele.

Cada teste chama a interface que o código real usa e verifica um resultado visível. Não teste funções privadas nem copie o algoritmo da implementação para calcular o valor esperado.

## Comandos

```sh
bun run test
bun run test:stress
bun run typecheck
```

`bun run test` compila o Bun Engine e executa os testes com quatro workers isolados. `--no-orphans` encerra os processos criados pela suíte quando o runner termina.

`bun run test:stress` executa cada arquivo três vezes e muda a ordem dos testes. Quando ele falhar, copie a seed exibida pelo Bun e reproduza com `bun test tests --seed=<seed>`.

Use `bun test tests --changed` durante uma alteração para receber retorno rápido. Rode `bun run test` antes de considerar o trabalho pronto.

## Recursos do Bun

- Use `test.each` quando várias entradas exercitam a mesma regra.
- Use `setSystemTime` para regras que dependem de `Date.now()`, `new Date()` ou `Intl.DateTimeFormat`. Ele não avança timers.
- Use `test.concurrent` somente quando os testes não compartilham arquivos, processos, servidores, variáveis globais ou implementações falsas.
- Use um `timeout` próprio quando uma operação possui um limite real diferente dos cinco segundos do runner.
- Use `test.failing` somente para registrar um defeito conhecido que ainda executa. Remova o marcador junto com a correção.
- Use `--coverage` para encontrar código sem teste. Não escreva testes apenas para aumentar uma porcentagem.

## Escolhas do projeto

- Use diretórios temporários por arquivo através de `tests/support/test-directory.ts`.
- Termine servidores, processos, bancos e streams no próprio teste.
- Espere escritas assíncronas, inclusive `observability.flush()`, antes de o teste terminar.
- Execute módulos internos reais. Substitua apenas sistemas externos.
- Prefira valores esperados explícitos a snapshots. Use snapshots somente quando o valor inteiro for o contrato e permanecer pequeno para revisão.
- Não use `--retry`. Uma falha que desaparece na repetição continua sendo um defeito.
- Não ative `--concurrent` para a suíte inteira.
