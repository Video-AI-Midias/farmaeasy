# FarmaEasy API

Backend FastAPI para sistema de gestao de farmacia.

## Stack

- **Runtime**: Python 3.12+ via `uv`
- **Framework**: FastAPI + Pydantic v2
- **Database**: Cassandra (ScyllaDB compatible)
- **Cache**: Redis
- **Logging**: structlog (JSON)

## Estrutura

```
src/
├── config/        # Settings (pydantic-settings)
├── core/          # Middleware, logging, deps
├── auth/          # Autenticação JWT
├── health/        # Health check endpoints
└── main.py        # App entrypoint

tests/
├── conftest.py    # Fixtures globais
└── test_*.py      # Testes por módulo
```

## Comandos

```bash
# Ambiente
uv sync                              # Instalar deps
uv sync --all-extras                 # Com dev deps

# Dev server
uv run uvicorn src.main:app --reload --port 8002

# Testes
uv run pytest                        # Roda testes + coverage
uv run pytest tests/test_health.py   # Módulo específico
uv run pytest -k "test_name"         # Teste específico
uv run pytest --no-cov               # Sem coverage

# Lint & Format
uv run ruff check .                  # Lint
uv run ruff check . --fix            # Auto-fix
uv run ruff format .                 # Format

# Validação completa
uv run pytest && uv run ruff check . && uv run ruff format --check .
```

## Convenções de Código

- Type hints obrigatórios em todas as funções
- Docstrings para funções públicas
- Async/await para I/O (database, HTTP)
- Injeção de dependências via `Depends()`
- Settings via `pydantic-settings` + `.env`

## Padrões

```python
# Router pattern
from fastapi import APIRouter, Depends
router = APIRouter(prefix="/v1/resource", tags=["resource"])

# Dependency injection
async def get_db() -> AsyncGenerator[Session, None]:
    ...

# Response model
class ResponseModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)

# Service pattern
class ResourceService:
    def __init__(self, db: Session):
        self.db = db

    async def get_all(self) -> list[Resource]:
        ...
```

## Variáveis de Ambiente

Copie `.env.example` para `.env`:

```bash
cp .env.example .env
```

Variáveis principais:

| Variável           | Descrição                | Default              |
| ------------------ | ------------------------ | -------------------- |
| `APP_NAME`         | Nome da aplicação        | farmaeasy            |
| `ENVIRONMENT`      | Ambiente                 | development          |
| `DEBUG`            | Modo debug               | true                 |
| `API_PORT`         | Porta do servidor        | 8000                 |
| `SECRET_KEY`       | Chave JWT                | (mudar em prod!)     |
| `REDIS_URL`        | URL do Redis             | redis://localhost... |
| `CASSANDRA_HOSTS`  | Hosts Cassandra          | ["localhost"]        |
| `LOG_LEVEL`        | Nível de log             | DEBUG                |

## Testes

- Coverage mínimo: 75%
- Markers: `@pytest.mark.unit`, `@pytest.mark.integration`, `@pytest.mark.slow`
- Fixtures em `tests/conftest.py`
- Factory pattern via `factory-boy`

```bash
# Rodar apenas testes rápidos
uv run pytest -m "not slow"

# Com verbose
uv run pytest -v

# Gerar relatório HTML
uv run pytest --cov-report=html
```

## Pre-commit

```bash
uv run pre-commit install
uv run pre-commit run --all-files
```

## Endpoints

| Método | Path           | Descrição            |
| ------ | -------------- | -------------------- |
| GET    | `/`            | Info da API          |
| GET    | `/health`      | Health check         |
| GET    | `/health/live` | Liveness probe       |
| GET    | `/health/ready`| Readiness probe      |
| GET    | `/docs`        | Swagger UI           |
| GET    | `/redoc`       | ReDoc                |

## Docker

```bash
# Build
docker build -t farmaeasy-api .

# Run
docker run -p 8001:8000 farmaeasy-api

# Desenvolvimento com docker-compose
docker compose up api
```
