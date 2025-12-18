# FarmaEasy

Sistema de Gestao de Farmacia

## Estrutura do Projeto

```
farmaeasy/
├── front/          # React + TypeScript frontend
├── api/            # FastAPI backend
├── docker/         # Docker configurations
└── docker-compose.yml
```

## Stack

### Frontend
- React 19 + TypeScript
- Vite 6
- TailwindCSS 4
- Zustand (state management)
- shadcn/ui (components)
- React Hook Form + Zod (forms)

### Backend
- Python 3.12+
- FastAPI
- Pydantic v2
- Cassandra (database)
- Redis (cache)
- UV (package manager)

## Quick Start

```bash
# Start all services
docker compose up -d

# Frontend development
cd front && npm install && npm run dev

# Backend development
cd api && uv sync && uv run uvicorn src.main:app --reload
```

## URLs

- Frontend: http://localhost:3000
- API: http://localhost:8001
- API Docs: http://localhost:8001/docs
- Nginx: http://localhost:8080
