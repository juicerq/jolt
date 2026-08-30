# Padrões do Renderer

Leia este arquivo antes de criar ou alterar código no Renderer.

## React

`useEffect` é proibido, exceto quando uma sincronização externa não puder ser feita durante a renderização, por um evento, pelo TanStack Query, pelo TanStack Store ou por uma API de assinatura. O uso exige uma explicação durante a revisão mostrando por que essas opções não resolvem o caso.

## Estado

- TanStack Query controla dados recebidos do Bun Engine.
- TanStack Store controla estado compartilhado no Renderer.
- O estado do componente controla dados usados somente por aquela parte da interface.

Use selectors ao ler o TanStack Store para evitar renderizações causadas por mudanças que o componente não usa.
