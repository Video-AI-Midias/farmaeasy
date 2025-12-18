# FarmaEasy - Arquitetura de Autenticação e Autorização

## Visão Geral

Sistema de cursos online com controle de acesso baseado em roles e assinaturas.

## Roles e Hierarquia

```
ADMIN (nível 3) - Acesso total ao sistema
    ↓
TEACHER (nível 2) - Gerencia próprios cursos e visualiza alunos
    ↓
STUDENT (nível 1) - Acessa cursos com assinatura ativa
    ↓
USER (nível 0) - Usuário registrado sem assinatura
```

### Permissões por Role

| Ação | USER | STUDENT | TEACHER | ADMIN |
|------|------|---------|---------|-------|
| Ver perfil próprio | ✅ | ✅ | ✅ | ✅ |
| Editar perfil próprio | ✅ | ✅ | ✅ | ✅ |
| Ver catálogo de cursos | ✅ | ✅ | ✅ | ✅ |
| Acessar conteúdo do curso | ❌ | ✅* | ✅** | ✅ |
| Criar curso | ❌ | ❌ | ✅ | ✅ |
| Editar próprio curso | ❌ | ❌ | ✅ | ✅ |
| Editar qualquer curso | ❌ | ❌ | ❌ | ✅ |
| Ver lista de alunos | ❌ | ❌ | ✅*** | ✅ |
| Gerenciar usuários | ❌ | ❌ | ❌ | ✅ |
| Gerenciar assinaturas | ❌ | ❌ | ❌ | ✅ |
| Gerenciar planos | ❌ | ❌ | ❌ | ✅ |

```
* STUDENT: Apenas cursos incluídos na assinatura ativa
** TEACHER: Acesso aos próprios cursos (para preview/edição)
*** TEACHER: Apenas alunos dos próprios cursos
```

## Entidades do Domínio

### 1. User (Usuário)

```python
class User:
    id: UUID                    # PK
    email: str                  # Unique, indexed
    cpf: str                    # Unique, indexed (opcional para estrangeiros)
    name: str
    phone: str
    password_hash: str
    role: UserRole              # user | student | teacher | admin
    is_active: bool
    avatar_url: str | None
    created_at: datetime
    updated_at: datetime
```

### 2. Subscription (Assinatura)

```python
class Subscription:
    id: UUID                    # PK
    user_id: UUID               # FK -> User, indexed
    plan_id: UUID               # FK -> Plan
    status: SubscriptionStatus  # active | cancelled | expired | pending
    starts_at: datetime
    expires_at: datetime
    cancelled_at: datetime | None
    created_at: datetime
    updated_at: datetime
```

### 3. Plan (Plano de Assinatura)

```python
class Plan:
    id: UUID                    # PK
    name: str                   # "Básico", "Premium", "Completo"
    description: str
    price_cents: int            # Preço em centavos
    duration_days: int          # Duração do plano
    is_active: bool
    features: list[str]         # Lista de features
    course_ids: list[UUID]      # Cursos incluídos (vazio = todos)
    created_at: datetime
    updated_at: datetime
```

### 4. Course (Curso)

```python
class Course:
    id: UUID                    # PK
    teacher_id: UUID            # FK -> User (role=teacher)
    title: str
    slug: str                   # URL-friendly, unique
    description: str
    thumbnail_url: str | None
    status: CourseStatus        # draft | published | archived
    is_free: bool               # Curso gratuito (não precisa assinatura)
    created_at: datetime
    updated_at: datetime
    published_at: datetime | None
```

### 5. Module (Módulo do Curso)

```python
class Module:
    id: UUID                    # PK
    course_id: UUID             # FK -> Course
    title: str
    description: str
    order: int                  # Ordem de exibição
    created_at: datetime
    updated_at: datetime
```

### 6. Lesson (Aula)

```python
class Lesson:
    id: UUID                    # PK
    module_id: UUID             # FK -> Module
    title: str
    description: str
    content_type: ContentType   # video | text | quiz
    content_url: str | None     # URL do vídeo/arquivo
    content_text: str | None    # Conteúdo em markdown
    duration_seconds: int       # Duração estimada
    order: int                  # Ordem de exibição
    is_preview: bool            # Disponível como preview gratuito
    created_at: datetime
    updated_at: datetime
```

### 7. Progress (Progresso do Aluno)

```python
class Progress:
    user_id: UUID               # PK (partition)
    lesson_id: UUID             # PK (clustering)
    completed: bool
    completed_at: datetime | None
    progress_seconds: int       # Tempo assistido (vídeos)
    created_at: datetime
    updated_at: datetime
```

## Fluxos de Acesso

### 1. Verificação de Acesso a Curso

```
┌─────────────────────────────────────────────────────────────────┐
│ GET /courses/{course_id}/lessons                                │
├─────────────────────────────────────────────────────────────────┤
│ 1. Autenticar usuário (JWT)                                     │
│ 2. Buscar curso por ID                                          │
│ 3. Verificar acesso:                                            │
│    a) Se curso.is_free = true → PERMITIR                       │
│    b) Se user.role = ADMIN → PERMITIR                          │
│    c) Se user.role = TEACHER e course.teacher_id = user.id     │
│       → PERMITIR                                                │
│    d) Se user.role = STUDENT:                                   │
│       - Buscar assinatura ativa do usuário                     │
│       - Verificar se plano inclui o curso                      │
│       - Se sim → PERMITIR                                       │
│    e) Caso contrário → 403 FORBIDDEN                           │
└─────────────────────────────────────────────────────────────────┘
```

### 2. Criação/Edição de Curso

```
┌─────────────────────────────────────────────────────────────────┐
│ POST /courses (Criar)                                           │
├─────────────────────────────────────────────────────────────────┤
│ Requer: role = TEACHER ou ADMIN                                 │
│ - TEACHER: course.teacher_id = user.id (automático)            │
│ - ADMIN: pode definir qualquer teacher_id                      │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ PATCH /courses/{id} (Editar)                                    │
├─────────────────────────────────────────────────────────────────┤
│ Requer:                                                         │
│ - ADMIN: pode editar qualquer curso                            │
│ - TEACHER: apenas se course.teacher_id = user.id               │
└─────────────────────────────────────────────────────────────────┘
```

### 3. Promoção de Role

```
┌─────────────────────────────────────────────────────────────────┐
│ PATCH /users/{id}/role (Alterar role)                          │
├─────────────────────────────────────────────────────────────────┤
│ Requer: role = ADMIN                                            │
│ Regras:                                                         │
│ - Não pode alterar próprio role                                │
│ - Não pode criar outro ADMIN (apenas super admin pode)         │
│ - Ao promover para STUDENT, verificar assinatura              │
└─────────────────────────────────────────────────────────────────┘
```

## Tokens e Sessões

### Access Token (JWT)

```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "role": "student",
  "subscription_status": "active",
  "exp": 1234567890,
  "type": "access",
  "iat": 1234567800
}
```

### Refresh Token

- Armazenado em cookie httpOnly
- Rotação a cada refresh (jti único)
- Tabela de tracking para revogação

## Estrutura de Arquivos

```
api/src/
├── auth/
│   ├── __init__.py
│   ├── models.py           # User, RefreshToken
│   ├── schemas.py          # Pydantic schemas
│   ├── security.py         # Password hash, JWT
│   ├── service.py          # AuthService
│   ├── dependencies.py     # get_current_user, require_role
│   ├── permissions.py      # RBAC logic
│   ├── router.py           # /auth endpoints
│   └── validators.py       # CPF, phone, email
├── subscriptions/
│   ├── __init__.py
│   ├── models.py           # Subscription, Plan
│   ├── schemas.py
│   ├── service.py
│   ├── dependencies.py     # require_active_subscription
│   └── router.py           # /subscriptions endpoints
├── courses/
│   ├── __init__.py
│   ├── models.py           # Course, Module, Lesson
│   ├── schemas.py
│   ├── service.py
│   ├── dependencies.py     # require_course_access
│   └── router.py           # /courses endpoints
├── progress/
│   ├── __init__.py
│   ├── models.py           # Progress
│   ├── schemas.py
│   ├── service.py
│   └── router.py           # /progress endpoints
└── users/
    ├── __init__.py
    ├── schemas.py
    ├── service.py
    └── router.py           # /users endpoints
```

## Endpoints da API

### Auth (`/v1/auth`)

| Método | Path | Descrição | Auth |
|--------|------|-----------|------|
| POST | /register | Cadastrar usuário | - |
| POST | /login | Fazer login | - |
| POST | /refresh | Renovar token | Cookie |
| POST | /logout | Fazer logout | Cookie |
| GET | /me | Dados do usuário atual | Bearer |
| POST | /validate/cpf | Validar CPF | - |
| POST | /validate/email | Validar email | - |

### Users (`/v1/users`)

| Método | Path | Descrição | Auth |
|--------|------|-----------|------|
| GET | / | Listar usuários | Admin |
| GET | /{id} | Buscar usuário | Admin |
| PATCH | /{id} | Atualizar usuário | Admin/Self |
| PATCH | /{id}/role | Alterar role | Admin |
| DELETE | /{id} | Desativar usuário | Admin |

### Subscriptions (`/v1/subscriptions`)

| Método | Path | Descrição | Auth |
|--------|------|-----------|------|
| GET | /plans | Listar planos | - |
| GET | /my | Minha assinatura | Bearer |
| POST | / | Criar assinatura | Bearer |
| POST | /{id}/cancel | Cancelar | Bearer/Admin |

### Courses (`/v1/courses`)

| Método | Path | Descrição | Auth |
|--------|------|-----------|------|
| GET | / | Listar cursos (catálogo) | - |
| GET | /{id} | Detalhes do curso | - |
| GET | /{id}/content | Conteúdo completo | Subscription |
| POST | / | Criar curso | Teacher/Admin |
| PATCH | /{id} | Editar curso | Owner/Admin |
| DELETE | /{id} | Arquivar curso | Owner/Admin |

### Modules & Lessons (`/v1/courses/{course_id}/...`)

| Método | Path | Descrição | Auth |
|--------|------|-----------|------|
| GET | /modules | Listar módulos | Subscription |
| POST | /modules | Criar módulo | Owner/Admin |
| PATCH | /modules/{id} | Editar módulo | Owner/Admin |
| GET | /modules/{id}/lessons | Listar aulas | Subscription |
| POST | /modules/{id}/lessons | Criar aula | Owner/Admin |
| PATCH | /lessons/{id} | Editar aula | Owner/Admin |

### Progress (`/v1/progress`)

| Método | Path | Descrição | Auth |
|--------|------|-----------|------|
| GET | /courses/{id} | Progresso no curso | Bearer |
| POST | /lessons/{id}/complete | Marcar como completo | Bearer |
| POST | /lessons/{id}/progress | Atualizar progresso | Bearer |

## Próximos Passos

1. **Fase 1 - Autenticação Base**
   - [ ] User model + migrations
   - [ ] Password hashing (Argon2)
   - [ ] JWT tokens (access + refresh)
   - [ ] Endpoints: register, login, logout, refresh, me

2. **Fase 2 - Autorização**
   - [ ] RBAC com roles hierárquicos
   - [ ] Dependencies para proteção de rotas
   - [ ] Middleware de validação

3. **Fase 3 - Subscriptions**
   - [ ] Plan model
   - [ ] Subscription model
   - [ ] Verificação de acesso a cursos

4. **Fase 4 - Courses**
   - [ ] Course, Module, Lesson models
   - [ ] CRUD de cursos
   - [ ] Controle de acesso por owner/subscription

5. **Fase 5 - Progress**
   - [ ] Progress tracking
   - [ ] Certificados (futuro)
