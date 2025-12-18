# FarmaEasy - Monorepo

Sistema de gestao de farmacia com arquitetura monorepo.

## Estrutura

```
farmaeasy/
├── api/           # Backend FastAPI (Python 3.12+)
├── front/         # Frontend React 19 (Vite + TypeScript)
└── docker/        # Docker configs (Cassandra, Redis, Nginx)
```

## Quick Start

```bash
# Backend
cd api && uv sync && uv run uvicorn src.main:app --reload --port 8002

# Frontend
cd front && npm install && npm run dev
```

## Stack

| Layer    | Tech                                          |
| -------- | --------------------------------------------- |
| Backend  | FastAPI, Pydantic v2, Cassandra, Redis        |
| Frontend | React 19, Vite 6, Tailwind v4, shadcn/ui      |
| Testing  | pytest (API), Vitest (Front)                  |
| Linting  | Ruff (API), Biome (Front)                     |
| Runtime  | uv (Python), npm (Node)                       |

## Convenções

- **Commits**: Conventional Commits (feat:, fix:, docs:, etc.)
- **Branch**: `feature/`, `fix/`, `chore/`
- **PR**: Sempre com testes passando
- **Idioma**: Código em inglês, comentários em português OK

## Validação Completa

```bash
# API
cd api && uv run pytest && uv run ruff check . && uv run ruff format --check .

# Front
cd front && npm run test -- --run && npm run lint && npm run typecheck
```

## Docker (Desenvolvimento)

```bash
docker compose up -d  # API + Cassandra + Redis + Nginx
```

### Serviços

| Serviço   | Porta Interna | Porta Externa | Descrição           |
| --------- | ------------- | ------------- | ------------------- |
| API       | 8000          | 8002          | FastAPI backend     |
| Redis     | 6379          | 6381          | Cache               |
| Cassandra | 9042          | 9044          | Database            |
| Nginx     | 80            | 8081          | Reverse proxy       |
| Frontend  | 3001          | 3001          | Vite dev server     |

## URLs

- **Frontend**: http://localhost:3001
- **API**: http://localhost:8002
- **API Docs**: http://localhost:8002/docs
- **Nginx**: http://localhost:8081

## Referências

- API docs: `api/CLAUDE.md`
- Front docs: `front/CLAUDE.md`

## Domínio: Farmácia

Sistema para gestão de:
- Produtos/Medicamentos (cadastro, estoque)
- Clientes/Pacientes
- Vendas/Pedidos
- Fornecedores
- Relatórios
