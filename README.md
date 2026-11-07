# TestPilot AI

**Connect your GitHub repository. Let AI test your application. Receive a complete QA report
with screenshots and reproducible bugs.**

TestPilot AI is an autonomous, AI-powered QA platform. It is being built in phases; this
repository currently contains **Phase 1 — the SaaS foundation**: authentication,
organizations, role-based access control, projects, encrypted project configuration, team
management and the full application shell. See
[`docs/development/implementation-status.md`](docs/development/implementation-status.md) for
exactly what is built, verified, waiting on credentials, or still to come.

## Stack

| Layer | Technology |
|---|---|
| Web | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS v4, Radix/shadcn-style components, Lucide |
| API | Node.js 22, Fastify 5, Zod, first-party DB sessions |
| Data | PostgreSQL 16, Prisma 6 |
| Jobs | Redis 7, BullMQ |
| Tests | Vitest (unit, integration, security), Playwright (e2e) |
| Infra | Docker, Docker Compose |

## Repository layout

```
apps/
  web/        Next.js application (UI; proxies /api/v1 to the API)
  api/        Fastify REST API (auth, tenancy, RBAC, projects, …)
  worker/     BullMQ worker (system queue in Phase 1; agent pipeline later)
packages/
  database/   Prisma schema, migrations, client, seed
  shared/     Zod schemas, RBAC, plans, queues, crypto, SSRF guard, redaction, DTO types
  ui/         Design tokens and UI components
  config/     Shared TypeScript configs
  testing/    API test harness (real DB, cookie-jar client, fake DNS)
infrastructure/
  docker/     Dockerfiles + docker-compose.yml
  scripts/    setup-local.sh
docs/
  architecture/  system-design, database-design, agent-workflow, security-model, deployment
  api/           REST API reference
  development/   implementation-status
tests/
  unit/ integration/ security/ e2e/
```

## Local setup

### Prerequisites

- Node.js **≥ 20.11** (22 recommended) and pnpm **10** (`corepack enable`)
- PostgreSQL **14+** and Redis **6+** — either via Docker (option A) or installed locally (option B)

### Option A — dependencies in Docker

```bash
corepack enable
pnpm install
cp .env.example .env
# put a fresh key into ENCRYPTION_KEYS in .env:
node -e "console.log('dev:' + require('crypto').randomBytes(32).toString('base64'))"

pnpm infra:up          # postgres (+ testpilot_test, testpilot_e2e DBs), redis, minio, mailpit
pnpm db:migrate
pnpm db:seed           # optional: demo@testpilot.local / ChangeMe123!
pnpm dev               # web :3000, api :4000, worker :4100
```

Open http://localhost:3000. With Docker, set `SMTP_URL=smtp://localhost:1025` in `.env` to
see emails in Mailpit at http://localhost:8025.

### Option B — locally installed PostgreSQL and Redis

Create a `testpilot` role (password `testpilot`, `CREATEDB`) and run:

```bash
corepack enable
./infrastructure/scripts/setup-local.sh   # creates .env (with a key), the 3 databases, installs, migrates
pnpm db:seed                              # optional
pnpm dev
```

Without `SMTP_URL`, development emails (verification, password reset, invitations) are printed
to the API log, including their links.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Run web, API and worker in watch mode |
| `pnpm build` | Production builds (tsup for API/worker, `next build`) |
| `pnpm typecheck` | TypeScript across every package and the tests |
| `pnpm lint` | ESLint |
| `pnpm test` | Unit + integration + security tests (needs PostgreSQL; uses `DATABASE_URL_TEST`) |
| `pnpm test:e2e` | Playwright browser tests (starts API on :4010 and web on :3010 against `testpilot_e2e`) |
| `pnpm verify` | All of the above |
| `pnpm db:migrate` / `db:migrate:dev` / `db:seed` | Database tasks (read the root `.env`) |

The integration tests refuse to run against a database whose name does not contain `test`;
the e2e tests require a database whose name contains `e2e`. Neither suite drops databases.

## Configuration

All variables are documented in [`.env.example`](.env.example). The API validates its
configuration at start-up and refuses to run in production without `ENCRYPTION_KEYS`,
`SMTP_URL` and `COOKIE_SECURE=true`. Integrations (GitHub, Anthropic, S3, Stripe) are optional
in Phase 1 and show as **Not configured** on the Integrations page until their variables are set.

## Security highlights

DB-backed opaque sessions (httpOnly, SameSite=Lax), CSRF header + Origin allow-list, scrypt
password hashing, backend-enforced RBAC with per-request membership checks, tenant isolation,
AES-256-GCM encrypted write-only project secrets with key rotation, SSRF validation of
application URLs, rate limiting, audit logging with redaction. Details:
[`docs/architecture/security-model.md`](docs/architecture/security-model.md).

## Documentation

- [System design](docs/architecture/system-design.md)
- [Database design & ERD](docs/architecture/database-design.md)
- [AI agent workflow](docs/architecture/agent-workflow.md)
- [Security model](docs/architecture/security-model.md)
- [Deployment](docs/architecture/deployment.md)
- [REST API v1](docs/api/README.md)
- [Implementation status](docs/development/implementation-status.md)
