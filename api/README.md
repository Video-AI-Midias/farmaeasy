# FarmaEasy API

Sistema de Gestao de Farmacia - Backend API

## Stack

- **Python 3.12+**
- **FastAPI** - Framework web async
- **Pydantic** - Validacao de dados
- **Cassandra** - Database NoSQL
- **Redis** - Cache
- **UV** - Package manager

## Development

```bash
# Install dependencies
uv sync

# Run development server
uv run uvicorn src.main:app --reload

# Run tests
uv run pytest

# Run linting
uv run ruff check .

# Run formatting
uv run ruff format .
```

## Docker

```bash
# Build image
docker build -t farmaeasy-api .

# Run with docker-compose
docker compose up -d
```
