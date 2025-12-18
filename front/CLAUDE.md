# FarmaEasy Frontend

Interface React para sistema de gestao de farmacia.

## Stack

- **Runtime**: Node.js / npm
- **Framework**: React 19 + TypeScript 5.7
- **Build**: Vite 6
- **Styling**: Tailwind CSS v4 + shadcn/ui
- **State**: Zustand
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
npm install                 # Instalar deps
npm run dev                 # Dev server (localhost:3001)
npm run build               # Production build
npm run preview             # Preview build

# Testes
npm run test                # Vitest watch mode
npm run test -- --run       # Single run
npm run test:ui             # UI mode
npm run test:coverage       # Com coverage

# Lint & Format
npm run lint                # Biome check
npm run lint:fix            # Auto-fix
npm run format              # Format only
npm run typecheck           # TypeScript validation

# Validação completa
npm run test -- --run && npm run lint && npm run typecheck
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
npx shadcn@latest add button
npx shadcn@latest add card
npx shadcn@latest add dialog
npx shadcn@latest add form
npx shadcn@latest add input
npx shadcn@latest add table
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
