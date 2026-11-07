# Implementation status

_Last updated: 2026-11-07 — end of Phase 1 development session._

Legend: ✅ implemented & verified by automated tests · 🟡 implemented, not fully verified ·
🔑 awaiting credentials · ⏳ not yet implemented (scheduled phase)

## Phase 1 acceptance criteria

> *A user can register, log in, create an organization, create a project, and manage it with
> persisted data.*

**Met.** Verified end-to-end in a real Chromium browser against the real web app, API and
PostgreSQL (`tests/e2e/phase1.spec.ts` → "Phase 1 acceptance: register → organization → project
→ manage → logout → login").

## Verification results (this session)

| Check | Command | Result |
|---|---|---|
| Dependency installation | `pnpm install` | ✅ |
| Database startup | local PostgreSQL 16 + Redis 7 | ✅ (Docker Compose stack provided but not run — no Docker daemon available) |
| Prisma migrations | `pnpm db:migrate` (dev, test, e2e DBs) + drift check `prisma migrate diff --exit-code` | ✅ no drift |
| Seed | `pnpm db:seed` (idempotent) | ✅ |
| TypeScript | `pnpm typecheck` (all 7 packages + tests) | ✅ 0 errors |
| Lint | `pnpm lint` (ESLint 9, typescript-eslint, react-hooks) | ✅ 0 problems |
| Unit tests | `pnpm test:unit` | ✅ 63 passed |
| Integration + security tests | `pnpm test:integration` (real PostgreSQL) | ✅ 62 passed |
| End-to-end tests | `pnpm test:e2e` (Playwright, desktop + mobile Chromium) | ✅ 8 passed |
| Production builds | `pnpm build` (tsup API/worker, `next build`) | ✅; built API and worker started and passed health checks |
| Docker images | `infrastructure/docker/Dockerfile.*` | 🟡 written, **not built** (no Docker daemon) |
| CI workflow | `.github/workflows/ci.yml` | 🟡 written, **not yet run** on GitHub |

## Feature status

### Implemented and verified ✅

**Foundation**
- pnpm monorepo: `apps/{web,api,worker}`, `packages/{database,shared,ui,config,testing}`.
- PostgreSQL schema with **all** Part 9 models (+ Session, UserToken, Workspace, ProjectSecret),
  UUID keys, FKs, indexes, enums, timestamps, tenant ownership; initial migration.
- Fastify REST API v1 with Zod validation, structured errors, pagination, rate limiting,
  helmet headers, request ids, redacted structured logging, health/readiness endpoints.
- Worker process with BullMQ `system` queue and health endpoint (real Redis round trip).

**Authentication**
- Register, login, logout, session endpoint, server-side session expiry/revocation.
- Email verification (token email, single use, resend), forgot/reset password (revokes sessions).
- Change password (revokes other sessions), profile update, active-session list/revoke.
- scrypt hashing, enumeration-safe login & forgot-password, per-endpoint rate limits.

**Multi-tenancy & RBAC**
- Create organizations (default workspace + Free subscription), switch, update, delete (slug-confirmed).
- Workspaces (list/create).
- Invitations (email, 7-day expiry, revoke, public preview, accept with email match).
- Members: list, change role, remove, leave; last-owner protection; rank rules.
- Owner/Admin/Developer/Viewer permission matrix enforced on the backend for every route;
  tenant isolation (cross-tenant → 404/403) verified by tests.
- Audit log (auth, org, membership, project, secret events) with redaction; UI for admins.

**Projects**
- Create / edit / archive / restore / delete (archived-only); search, status filter, pagination.
- Application URL with SSRF validation; default branch validation; workspace assignment.
- Test configuration (viewports, categories, max pages, timeouts, video, push/PR triggers).
- Encrypted environment variables and test credentials (AES-256-GCM, write-only, key rotation).
- Plan limits enforced (projects, members).

**Web app (Next.js 15, Tailwind v4, Radix/shadcn-style UI, Lucide)**
- Screens: login, registration, forgot/reset password, verify email, invitation accept,
  organization onboarding, dashboard, projects list, create project, project overview
  (overview/settings/environment/credentials/advanced tabs), team management, integrations,
  billing overview, account settings, organization settings (+ workspaces, audit log, delete).
- Full sidebar navigation (all Part 2.2 items), collapsible, mobile drawer, org switcher,
  user menu, light/dark/system theme.
- Pages for not-yet-built features (test runs, test cases, AI agents, visual QA, bugs, history,
  analytics, reports, repositories) read the real API and show honest empty states — no
  fabricated statistics or sample data anywhere.

### Implemented, not fully verified 🟡
- Docker images and Compose `app` profile (not built in this environment).
- GitHub Actions CI workflow (not yet executed).
- SMTP email delivery path (`SMTP_URL`): code path exists; tests use the in-memory transport
  and development uses the log transport. Not exercised against a real SMTP server.
- Redis-backed distributed rate limiting (used when `REDIS_URL` is set outside tests; the
  rate-limit test runs with the in-memory store).

### Awaiting credentials 🔑
These have configuration validation and clear "not configured" states in the API and UI; the
integration itself is scheduled for its phase.

| Integration | Needed | Phase |
|---|---|---|
| GitHub App (repos, webhooks, PRs) | `GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET` | 2 |
| GitHub OAuth sign-in | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | 2 |
| Anthropic Claude | `ANTHROPIC_API_KEY` | 3 |
| S3-compatible storage | `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | 4 |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | 7 |
| Production email | `SMTP_URL` | before launch |

### Not yet implemented ⏳
- **Phase 2:** GitHub App installation flow, repository/branch/commit sync, webhooks with
  signature verification, sandboxed cloning, Repository Analyst agent, GitHub sign-in.
- **Phase 3:** agent orchestrator, app startup in sandbox, Application Explorer, Test Planner,
  test case persistence from agents.
- **Phase 4:** browser workers, Playwright execution across viewports, screenshots/video,
  console & network capture, artifact storage with signed URLs, live run updates (SSE),
  test-run creation/retry (currently returns 501 and creates nothing).
- **Phase 5:** Visual QA, defect annotation, Bug Analyst, screenshot gallery/comparison,
  HTML/PDF reports.
- **Phase 6:** push/PR-triggered runs, regression comparison, PR summaries.
- **Phase 7:** Stripe checkout/portal/webhooks, usage metering, enterprise configuration,
  production monitoring dashboards.

## Known issues / limitations
- Expired sessions and tokens are cleaned up lazily; no periodic cleanup job yet.
- No CSP on the Next.js app yet (needs nonce-based setup); API has a strict CSP.
- No MFA / SSO yet.
- API Docker image ships the full workspace `node_modules` (larger than necessary).
- `next build` must receive the production `API_URL` at build time (it is compiled into the
  `/api/v1` rewrite).
- The dashboard "Recent screenshots" panel is an empty state until Phase 4 introduces artifacts.

## Next development tasks (Phase 2)
1. Register a GitHub App (least privilege: `contents:read`, `metadata:read`,
   `pull_requests:write`, `checks:write`; events: push, pull_request, installation).
2. Implement install callback + `GitHubConnection` persistence (encrypted tokens), repository
   and branch sync, project ↔ repository linking UI.
3. Webhook endpoint with HMAC verification and idempotent delivery handling.
4. Sandboxed clone job (`tp-repo-clone`) using short-lived installation tokens; egress policy.
5. Repository Analyst agent (Claude, structured output) → `Repository.analysis` + UI.
6. GitHub OAuth sign-in on the existing session model.
