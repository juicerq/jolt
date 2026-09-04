# Times de Bots

## Desenvolvimento

```sh
bun install --frozen-lockfile
bun run test
bun run typecheck
bun run build:engine
bun run build:electron
```

`bun run dev` compila o Bun Engine e abre o Electron em modo de desenvolvimento. Ele guarda os dados em `.jolt-dev`, separado do aplicativo instalado. `bun run dev:load` usa `.jolt-load` e o Fornecedor de carga.

`bun run package:linux` gera o AppImage em `release/`.
