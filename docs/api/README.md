# REST API v1

Base path: `/api/v1`. In the browser, call it on the web app's origin (Next.js proxies it to
the API service). JSON request and response bodies.

## Conventions

**Authentication** — `tp_session` httpOnly cookie, set by `register`/`login`.

**CSRF** — every non-GET request must send `x-testpilot-csrf: 1`. Requests with an `Origin`
header must come from an allowed origin (`WEB_URL`, `ALLOWED_ORIGINS`).

**Tenant** — tenant-scoped endpoints act on the session's *active organization*
(`POST /organizations/:id/switch`), or on the organization in the `x-organization-id` header
(membership required).

**Errors**

```json
{ "error": { "code": "VALIDATION_FAILED", "message": "Request validation failed",
             "details": [{ "path": "email", "message": "Enter a valid email address" }],
             "requestId": "8b0e…" } }
```

| Status | Codes |
|---|---|
| 400 | `BAD_REQUEST`, `INVALID_TOKEN`, `INVALID_PASSWORD` |
| 401 | `UNAUTHENTICATED`, `INVALID_CREDENTIALS` |
| 402 | `PLAN_LIMIT_REACHED` |
| 403 | `FORBIDDEN`, `NO_ACTIVE_ORGANIZATION`, `EMAIL_NOT_VERIFIED`, `CSRF_HEADER_MISSING`, `CSRF_ORIGIN_REJECTED`, `INVITATION_EMAIL_MISMATCH` |
| 404 | `NOT_FOUND`, `INVITATION_INVALID` (also returned for resources in other tenants) |
| 409 | `CONFLICT`, `EMAIL_TAKEN`, `SLUG_TAKEN`, `ALREADY_MEMBER`, `LAST_OWNER`, `PROJECT_NOT_ARCHIVED`, `PROJECT_ARCHIVED`, `RUN_NOT_ACTIVE` |
| 413 | body larger than 1 MB |
| 422 | `VALIDATION_FAILED` |
| 429 | `RATE_LIMITED` |
| 501 | `NOT_IMPLEMENTED`, `EXECUTION_ENGINE_UNAVAILABLE` (feature scheduled for a later phase) |
| 503 | `INTEGRATION_NOT_CONFIGURED` (`details.missing` lists env var names) |

**Pagination** — `?page=1&pageSize=20` (max 100). Response:
`{ "data": [...], "pagination": { "page", "pageSize", "total", "totalPages" } }`.

Permission names below refer to `packages/shared/src/rbac.ts`.

## Health

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Liveness |
| GET | `/health/ready` | Readiness: `{ status, checks: { database, redis } }` (503 if degraded) |

## Auth — `/auth`

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/register` | `{ name, email, password }` | 201 → `SessionDTO`; sends verification email. 5/min/IP |
| POST | `/login` | `{ email, password }` | → `SessionDTO`. 10/min/IP |
| POST | `/logout` | — | 204; deletes the session server-side |
| GET | `/session` | — | → `SessionDTO` (`user`, `organizations`, `activeOrganization` with `permissions`) |
| POST | `/verify-email` | `{ token }` | single use, 24 h |
| POST | `/resend-verification` | — | auth required, 3/min |
| POST | `/forgot-password` | `{ email }` | always 202 |
| POST | `/reset-password` | `{ token, password }` | single use, 1 h; revokes all sessions |
| GET | `/github` | — | GitHub sign-in: 503 until configured; Phase 2 |

## Current user — `/me`

| Method | Path | Body |
|---|---|---|
| GET | `/` | — |
| PATCH | `/` | `{ name }` |
| POST | `/password` | `{ currentPassword, newPassword }` — revokes other sessions |
| GET | `/sessions` | — |
| DELETE | `/sessions/:id` | — |

## Organizations — `/organizations`

| Method | Path | Permission | Body |
|---|---|---|---|
| GET | `/` | auth | — (organizations the user belongs to) |
| POST | `/` | auth | `{ name, slug? }` → creates org, owner membership, default workspace, Free subscription; becomes active |
| POST | `/:id/switch` | member | — → `SessionDTO` |
| GET | `/current` | `org:read` | — |
| PATCH | `/current` | `org:update` | `{ name?, slug? }` |
| DELETE | `/current` | `org:delete` | `{ confirm: "<slug>" }` |
| GET | `/current/workspaces` | `org:read` | — |
| POST | `/current/workspaces` | `workspaces:manage` | `{ name }` |

## Members — `/members`

| Method | Path | Permission | Body |
|---|---|---|---|
| GET | `/` | `members:read` | — |
| PATCH | `/:id` | `members:update` + rank rules | `{ role }` |
| DELETE | `/:id` | self (leave) or `members:remove` + rank rules | — |

## Invitations — `/invitations`

| Method | Path | Permission | Body |
|---|---|---|---|
| GET | `/` | `members:read` | — (pending) |
| POST | `/` | `members:invite`, verified email, plan member limit | `{ email, role }` |
| DELETE | `/:id` | `members:invite` | — (revoke) |
| GET | `/token/:token` | public | preview: org name, inviter, role, email |
| POST | `/token/:token/accept` | auth, email must match | → `SessionDTO` |

## Projects — `/projects`

| Method | Path | Permission | Body / query |
|---|---|---|---|
| GET | `/` | `projects:read` | `?status=ACTIVE\|ARCHIVED\|ALL&search=&workspaceId=&page=&pageSize=` |
| POST | `/` | `projects:create`, plan limit | `{ name, description?, appUrl?, defaultBranch?, workspaceId? }` — `appUrl` passes SSRF checks |
| GET | `/:id` | `projects:read` | — |
| PATCH | `/:id` | `projects:update` (`status` change: Owner/Admin) | `{ name?, description?, appUrl?, defaultBranch?, testSettings?, status? }` |
| DELETE | `/:id` | `projects:delete` | only when ARCHIVED |
| GET | `/:id/secrets` | `secrets:read-metadata` | metadata only (never values) |
| PUT | `/:id/secrets` | `secrets:manage` | `{ kind: "ENV_VAR"\|"TEST_CREDENTIAL", key, value, description? }` (upsert) |
| DELETE | `/:id/secrets/:secretId` | `secrets:manage` | — |

`testSettings`: `{ viewports: ("desktop"|"laptop"|"tablet"|"mobile-390"|"mobile-360")[], categories: (FUNCTIONAL|UI_UX|NEGATIVE|ACCESSIBILITY|PERFORMANCE|RESPONSIVE)[], maxPages, testTimeoutSeconds, recordVideo, runOnPush, runOnPullRequest }`

## Dashboard — `/dashboard`

`GET /` (`projects:read`) → `DashboardDTO`: totals, recent runs, 14-day trend, project quality,
recent activity — all computed from stored data.

## GitHub — `/github` (Phase 2)

| Method | Path | Permission | Phase 1 behaviour |
|---|---|---|---|
| GET | `/status` | `integrations:read` | configuration status + connections |
| POST | `/connect` | `integrations:manage` | 503 `INTEGRATION_NOT_CONFIGURED` / 501 until Phase 2 |
| GET | `/repositories` | `repositories:read` | lists connected repositories (DB) |
| GET | `/repositories/:id/branches` | `repositories:read` | lists stored branches |

## Testing & results

| Method | Path | Permission | Phase 1 behaviour |
|---|---|---|---|
| GET | `/test-runs` | `testruns:read` | real list (`?projectId=`) |
| POST | `/test-runs` | `testruns:create` | `{ projectId, branch? }` → **501 `EXECUTION_ENGINE_UNAVAILABLE`**; nothing is created |
| GET | `/test-runs/:id` | `testruns:read` | real |
| POST | `/test-runs/:id/cancel` | `testruns:cancel` | real (QUEUED/PREPARING/RUNNING → CANCELLED) |
| POST | `/test-runs/:id/retry` | `testruns:create` | 501 until Phase 4 |
| GET | `/test-runs/:id/executions` | `testruns:read` | real |
| GET | `/test-runs/:id/artifacts` | `testruns:read` | metadata; signed URLs in Phase 4 |
| GET | `/test-cases` | `testruns:read` | real |
| GET | `/bugs` | `bugs:read` | real |
| GET | `/reports` | `reports:read` | real |

## Billing — `/billing`

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/` | `billing:read` | plan, limits, usage, provider status, plan catalogue |
| POST | `/checkout` | `billing:manage` | `{ plan: "PRO"\|"TEAM" }` → 503 until Stripe configured; Phase 7 |
| POST | `/portal` | `billing:manage` | 503 until Stripe configured; Phase 7 |

## Integrations & audit

| Method | Path | Permission |
|---|---|---|
| GET | `/integrations` | `integrations:read` — status of GitHub, Anthropic, storage, queue, email, Stripe (missing env var *names* only) |
| GET | `/audit-logs` | `audit:read` — paginated |
