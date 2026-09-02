# Padrões do Renderer

Leia este arquivo antes de criar ou alterar código no Renderer.

Leia `DESIGN.md` antes de criar, alterar ou revisar a interface. Ele define os tokens, a hierarquia visual e a anatomia dos componentes do Jolt.

## React

`useEffect` é proibido, exceto quando uma sincronização externa não puder ser feita durante a renderização, por um evento, pelo TanStack Query, pelo TanStack Store ou por uma API de assinatura. O uso exige uma explicação durante a revisão mostrando por que essas opções não resolvem o caso.

## Estado

- TanStack Query controla dados recebidos do Bun Engine.
- TanStack Store controla estado compartilhado no Renderer.
- `chat/chat-events.ts` assina `conversations.events` uma vez, em `main.tsx`, e alimenta o `chatStore` com todo turno de todo Bot. Componentes não consomem streams do Engine.
- O estado do componente controla dados usados somente por aquela parte da interface.

Use selectors ao ler o TanStack Store para evitar renderizações causadas por mudanças que o componente não usa.

## Importações de `src/shared`

O Renderer não valida dados: o Bun Engine já validou tudo que envia. Importe de `src/shared` apenas tipos, com `import type`, ou arquivos sem arktype, como `bot-efforts.ts` e `weekdays.ts`. Um valor importado de um arquivo com schemas compila todos os schemas dele no boot do Renderer. O teste em `tests/renderer/engine-client.test.ts` falha quando o arktype entra no bundle.
