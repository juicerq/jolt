# Times de Bots

## Desenvolvimento

```sh
bun install --frozen-lockfile
bun run check
bun run build:engine
bun run build:electron
```

`bun run dev` compila o Bun Engine e abre o Electron em modo de desenvolvimento. Ele guarda os dados em `.jolt-dev`, separado do aplicativo instalado. `bun run dev:load` usa `.jolt-load` e o Fornecedor de carga.

`bun run package:linux` gera o AppImage em `release/`.

`bun run release 0.2.0` grava a versão no `package.json`, commita, cria a tag `v0.2.0` e empurra tudo. O CI então constrói Linux, macOS e Windows e publica o Release, de onde o aplicativo instalado se atualiza sozinho.
