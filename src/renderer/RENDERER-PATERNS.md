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

O Renderer não valida dados: o Bun Engine já validou tudo que envia. Importe de `src/shared` apenas tipos, com `import type`, ou arquivos sem schemas, como `bot-efforts.ts` e `weekdays.ts`. Um valor importado de um arquivo com schemas constrói todos os schemas dele no boot do Renderer e inclui o Zod no bundle.

## Scroll da conversa

`ChatScroller` revela mensagens anteriores com `startTransition` e deixa a ancoragem de scroll do Chromium manter as mensagens em vista no lugar. A ancoragem não age com `scrollTop` em 0, por isso `revealAbove` garante 1 px antes de revelar, e o botão de revelar usa `overflow-anchor: none` para não virar a âncora.

## Classes repetidas em massa

Um `className` longo repetido em centenas de elementos custa na abertura da conversa: o Chromium tokeniza o atributo `class` de cada elemento criado. Estilo para descendentes de um elemento repetido, como as cores `hljs-*` dos blocos de código, fica numa classe própria em `styles.css` dentro de `@layer components`, hoje `.chat-code`. Uma variante arbitrária do Tailwind troca `_` por espaço, então `[&_.hljs-built_in]` nunca casa; a regra CSS não tem esse problema.
