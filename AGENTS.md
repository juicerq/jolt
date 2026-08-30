# Código

Todo agente que escrever ou alterar código deve usar o Skill tool com name `code-practices` e o Skill tool com name `codebase-design` antes de agir. As duas chamadas são obrigatórias mesmo em mudanças pequenas.

# React

`useEffect` is prohibited unless an external synchronization cannot be expressed through rendering, event handlers, TanStack Query, TanStack Store, or a dedicated subscription API. Its use requires proof during review that each alternative fails.

TanStack Query owns server state. TanStack Store owns shared client state. Component state owns state that is local to one component subtree.

Use selectors when reading TanStack Store so unrelated changes do not rerender a component.
