# Times de Bots

## Desenvolvimento

```sh
bun install --frozen-lockfile
bun run check
bun run build:engine
bun run build:electron
```

`bun run dev` compila o Bun Engine e abre o Electron em modo de desenvolvimento. Ele guarda os dados em `~/.config/mimo-dev` (`MIMO_USER_DATA` troca a pasta), separado do aplicativo instalado. `bun run dev:load` usa `.mimo-load` e o Fornecedor de carga.

Para abrir o Mimo dev no celular, ligue "Acesso pelo celular" em Configurações → Celular e leia o QR com o celular na mesma rede Tailscale. O Mimo configura o `tailscale serve` sozinho: no dev aponta para o Vite, que serve o Renderer e repassa `/rpc` ao Engine em `127.0.0.1:4141`; no aplicativo instalado aponta direto para o Engine. A checagem de origem do Engine é a mesma nos dois casos.

Imports que cruzam pastas usam o alias `@src/...`. `bun run check` roda oxlint, o typecheck e o knip.

`bun run package:linux` gera o AppImage em `release/`.

`bun run release 0.2.0` grava a versão no `package.json`, commita, cria a tag `v0.2.0` e empurra tudo. O CI então constrói Linux, macOS e Windows e publica o Release, de onde o aplicativo instalado se atualiza sozinho.
