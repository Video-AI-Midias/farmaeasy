# FarmaEasy Frontend

Interface React para sistema de gestao de farmacia.

## Stack

- **Runtime**: Bun (gerenciador de pacotes e runtime)
- **Framework**: React 19 + TypeScript 5.7
- **Build**: Vite 6
- **Styling**: Tailwind CSS v4 + shadcn/ui
- **State**: Zustand
- **Data Fetching**: TanStack Query (React Query)
- **Charts**: Recharts
- **Forms**: React Hook Form + Zod
- **Icons**: Lucide React
- **Testing**: Vitest + React Testing Library

## Estrutura

```
src/
├── components/
│   └── ui/          # shadcn/ui components
├── pages/           # Page components
├── stores/          # Zustand stores
├── hooks/           # Custom hooks
├── lib/
│   └── utils.ts     # cn() utility
├── types/           # TypeScript types
├── i18n/            # Internacionalização
├── App.tsx          # Root component
├── main.tsx         # Entry point
└── index.css        # Tailwind v4 + tema
```

## Comandos

```bash
# Dev
bun install                 # Instalar deps
bun dev                     # Dev server (localhost:3001)
bun run build               # Production build
bun run preview             # Preview build

# Testes
bun test                    # Vitest watch mode
bun test --run              # Single run
bun run test:ui             # UI mode
bun run test:coverage       # Com coverage

# Lint & Format
bun run lint                # Biome check
bun run lint:fix            # Auto-fix
bun run format              # Format only
bun run typecheck           # TypeScript validation

# Validação completa
bun test --run && bun run lint && bun run typecheck

# Adicionar dependências
bun add <package>           # Produção
bun add -d <package>        # Dev dependency
```

## Convenções de Código

- Functional components com hooks
- Props tipadas via interface/type
- Path alias: `@/` = `./src/`
- Imports organizados (Biome auto-sort)
- Testes co-localizados: `Component.test.tsx`
- Nomes em inglês, comentários em português OK

## shadcn/ui

Adicionar componentes:

```bash
bunx --bun shadcn@latest add button
bunx --bun shadcn@latest add card
bunx --bun shadcn@latest add dialog
bunx --bun shadcn@latest add form
bunx --bun shadcn@latest add input
bunx --bun shadcn@latest add table
```

Componentes ficam em `src/components/ui/`.

## Padrões

```tsx
// Component pattern
interface Props {
  title: string;
  onClick?: () => void;
}

export function MyComponent({ title, onClick }: Props) {
  return <button type="button" onClick={onClick}>{title}</button>;
}

// cn() utility para classes condicionais
import { cn } from "@/lib/utils";
<div className={cn("base-class", isActive && "active-class")} />

// Zustand store pattern
import { create } from "zustand";

interface StoreState {
  items: Item[];
  addItem: (item: Item) => void;
}

export const useStore = create<StoreState>((set) => ({
  items: [],
  addItem: (item) => set((state) => ({ items: [...state.items, item] })),
}));

// Form pattern (React Hook Form + Zod)
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const schema = z.object({
  name: z.string().min(1, "Nome obrigatório"),
});

type FormData = z.infer<typeof schema>;

export function MyForm() {
  const form = useForm<FormData>({
    resolver: zodResolver(schema),
  });
  // ...
}
```

## Proxy API

Dev server com proxy para backend:

```
/api/* -> http://localhost:8002
```

Configurado em `vite.config.ts`.

## Design System

Cores definidas em `src/index.css`:

| Token              | Uso                          |
| ------------------ | ---------------------------- |
| `--primary`        | Ações principais (verde)     |
| `--secondary`      | Ações secundárias            |
| `--accent`         | Destaques (teal)             |
| `--destructive`    | Ações perigosas (vermelho)   |
| `--muted`          | Textos secundários           |
| `--background`     | Fundo da aplicação           |
| `--foreground`     | Texto principal              |
| `--border`         | Bordas                       |

Suporte a dark mode via `data-theme="dark"`.

## Git Hooks

Pre-commit roda `biome check --staged` automaticamente via Husky.

## Biome

Configurado em `biome.json`:

- Indent: 2 spaces
- Line width: 100
- Quotes: double
- Semicolons: always
- Trailing commas: all

## TypeScript

Configurado em `tsconfig.json` com modo estrito:

- `strict: true`
- `noUnusedLocals: true`
- `noUnusedParameters: true`
- `noUncheckedIndexedAccess: true`
- `exactOptionalPropertyTypes: true`
