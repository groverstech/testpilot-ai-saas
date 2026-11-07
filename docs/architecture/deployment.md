# Deployment

> Status: Dockerfiles and a Compose stack are provided in `infrastructure/docker/`. They have
> **not been built or run in CI yet** (the development environment used for Phase 1 had no
> Docker daemon). The application itself was verified with locally installed PostgreSQL 16 and
> Redis 7 — see `docs/development/implementation-status.md`.

## Services

| Service | Image | Port | Scale | Notes |
|---|---|---|---|---|
| web | `Dockerfile.web` (Next.js standalone) | 3000 | horizontal, stateless | `API_URL` is baked in at build time (rewrite target) |
| api | `Dockerfile.api` | 4000 | horizontal, stateless | Needs PostgreSQL, Redis (rate limits), SMTP |
| worker | `Dockerfile.worker` | 4100 (health) | horizontal per queue | Phase 1: system queue only |
| migrate | `Dockerfile.api` | — | one-off job | `pnpm --filter @testpilot/database migrate:deploy` before each release |
| browser workers | (Phase 4) Playwright image | — | autoscaled | Separate node pool / network, see security model |
| PostgreSQL 16 | managed (RDS, Cloud SQL, Neon…) | 5432 | — | Enable automated backups + PITR |
| Redis 7 | managed (ElastiCache, Upstash…) | 6379 | — | `maxmemory-policy noeviction` for BullMQ |
| Object storage | S3 / R2 / GCS (S3 API) / MinIO | — | — | Private bucket, lifecycle rule per retention |

## Required production configuration

The API refuses to start in production without:

- `DATABASE_URL`
- `ENCRYPTION_KEYS` (32-byte base64 key(s); store in a secrets manager)
- `SMTP_URL` (verification/reset/invite emails)
- `COOKIE_SECURE=true` (HTTPS only)
- `ALLOW_PRIVATE_APP_URLS` unset/false

Also set `WEB_URL` (public origin, used for links and the CSRF origin allow-list),
`TRUST_PROXY=true` behind a load balancer (correct client IPs for rate limiting and audit logs),
and `REDIS_URL` (shared rate-limit counters across API replicas).

## Topology

```
            ┌──────────── CDN / LB (TLS) ────────────┐
            │                                        │
         web (Next.js)  ── /api/v1 rewrite ──►  api (Fastify)
                                                  │   │
                                     PostgreSQL ◄─┘   └─► Redis ◄── worker(s)
                                                                      │
                                         (Phase 4) isolated browser-worker pool
                                         egress: customer app URLs only
```

Only `web` needs to be publicly reachable; `api` may be private if all traffic goes through
the web rewrite (recommended). GitHub/Stripe webhooks (later phases) must reach the API — expose
only `/api/v1/webhooks/*` publicly in that case.

## Release procedure

1. Build images (`web` with the correct `API_URL` build arg).
2. Run the `migrate` job (`prisma migrate deploy`). Migrations are additive; destructive
   changes are split into expand/contract releases.
3. Roll out `api` and `worker`, then `web`.
4. Health checks: `GET /health` (liveness), `GET /health/ready` (DB + Redis), worker
   `GET :4100/health`.

## Local Docker

```bash
docker compose -f infrastructure/docker/docker-compose.yml up -d              # postgres, redis, minio, mailpit
docker compose -f infrastructure/docker/docker-compose.yml --profile app up --build
```

## Observability

- Structured JSON logs (pino) with request ids; sensitive fields redacted.
- Health endpoints above; queue depth and job metrics via BullMQ (dashboard planned for Phase 7).
- Planned: OpenTelemetry traces across API → queue → agents, error tracking (Sentry-compatible),
  and per-agent token/cost metrics from `AgentExecution`.
