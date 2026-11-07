# Security model

Security controls, where they live in the code, and how they are verified.
Controls marked **[built]** are implemented and covered by automated tests
(`tests/security`, `tests/integration`, `tests/unit`).

## Trust boundaries

1. **Browser ↔ web/API** — untrusted input. All validation and authorization are done by the API.
2. **Control plane** (web, API, orchestrator, PostgreSQL, Redis, object storage) — trusted;
   holds platform secrets.
3. **Execution plane** (repository sandboxes, browser workers) — runs **untrusted customer code**
   and visits customer sites. Must be treated as hostile.

> Customer repository code is **never** executed on the API host or in any container that holds
> platform credentials.

## Authentication [built]

| Control | Implementation |
|---|---|
| Password hashing | scrypt N=16384, r=8, p=1, 16-byte salt, per-hash parameters (`packages/shared/src/password.ts`) |
| Password policy | ≥10 chars, letters + digits, ≤128 (`passwordSchema`) |
| Sessions | 256-bit random token in `tp_session` cookie; only SHA-256 stored; server-side expiry (30 days default); revocable |
| Cookie flags | `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` when `COOKIE_SECURE=true` (enforced in production) |
| Login enumeration | Same error for unknown email / wrong password; dummy hash comparison equalises timing |
| Reset/verify tokens | Single-use, hashed, short-lived (reset 1h, verify 24h); forgot-password always returns 202 |
| Session revocation | Password reset revokes all sessions; password change revokes all others; users can revoke individual sessions |
| Rate limiting | Global 300/min/IP; login & token endpoints 10/min; register & forgot 5/min; resend 3/min (Redis-backed when `REDIS_URL` is set) |

## Authorization & tenancy [built]

- Permission matrix in `packages/shared/src/rbac.ts` (Owner ⊃ Admin ⊃ Developer ⊃ Viewer).
- `requireOrg(request, permission)` re-loads the caller's membership on every request, so role
  changes and removals take effect immediately.
- Role escalation rules (`canManageRole`): only owners grant/modify OWNER; nobody manages a
  more privileged member; an organization always keeps ≥1 owner.
- Tenant isolation: every tenant query filters by `organizationId`; cross-tenant ids return
  404; the `x-organization-id` override requires membership.
- The web app hides controls the user cannot use, but **never** relies on that.

## CSRF [built]

SameSite=Lax cookie + mandatory `x-testpilot-csrf: 1` header on non-GET requests (cannot be
sent cross-site without a CORS preflight, which the API never grants) + Origin allow-list
(`WEB_URL`, `ALLOWED_ORIGINS`). Signature-authenticated endpoints (webhooks, Phase 2) opt out
per route.

## Secrets [built]

- Project environment variables and test credentials: AES-256-GCM, random 96-bit IV, key id in
  the envelope for rotation (`ENCRYPTION_KEYS=new:…,old:…`), AAD =
  `project-secret:{projectId}:{kind}:{key}`.
- **Write-only:** no endpoint returns a secret value. Env vars may show a 4-character hint for
  values ≥12 characters; credentials never do.
- Audit metadata and logs pass through `redact()`; Fastify's logger redacts cookies,
  authorization headers and `password`/`token`/`value` fields.
- Platform credentials (GitHub App key, Anthropic, Stripe, S3) live only in environment
  variables of control-plane services. `/integrations` reports which are *missing* by name,
  never their values.

## Input validation & hardening [built]

- Every request body, query and route param is validated with Zod; ids must be UUIDs.
- 1 MB body limit; malformed JSON → 400; structured error bodies without stack traces.
- `helmet` headers on the API (`default-src 'none'` CSP, nosniff, frame denial); Next.js sends
  `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`.
- Open-redirect protection for `?next=` (`apps/web/src/lib/safe-next.ts`).
- Auth forms use `method="post"` and stay disabled until hydration, so credentials can never
  be submitted in a URL.

## SSRF protection [built: validation · phase 4: network]

`assertSafePublicUrl` rejects non-http(s) schemes, embedded credentials, `localhost`,
`*.internal`, `*.local`, and any hostname that resolves to loopback, RFC1918, link-local
(including `169.254.169.254` cloud metadata), CGNAT, multicast, documentation or reserved
ranges — for IPv4 and IPv6 (incl. IPv4-mapped). If *any* resolved address is private the URL is
rejected (defends against mixed DNS answers). `ALLOW_PRIVATE_APP_URLS=true` exists for local
development only and is refused in production.

Because DNS can change after validation (rebinding), the **authoritative** control is at the
network layer of the execution plane (below).

## Execution-plane isolation [phase 2–4]

Required controls for repository sandboxes and browser workers:

- One ephemeral container (or microVM, e.g. gVisor/Firecracker) per run; destroyed afterwards;
  temp directories wiped.
- Non-root user, read-only root filesystem, `no-new-privileges`, all capabilities dropped,
  seccomp default profile, no Docker socket.
- CPU, memory, PID and wall-clock limits per job (queue policy timeouts in `QUEUE_POLICIES`).
- **Egress policy:** deny by default; allow the customer's application URL, package registries
  during install only, and object storage via pre-signed upload URLs. Explicitly block RFC1918,
  link-local/metadata, and the control-plane network.
- No platform credentials inside the sandbox. GitHub access uses a short-lived, read-only,
  single-repository installation token used for the clone and then discarded.
- Customer env vars are injected only into the customer app process; test credentials only into
  the browser automation context; both are added to the redaction list for that run.

## Artifacts [phase 4]

Private bucket, keys namespaced `test-results/{projectId}/{runId}/…`; downloads only through
short-lived (≤5 min) pre-signed URLs issued after a tenant-scoped authorization check;
retention per plan (`artifactRetentionDays`).

## Webhooks [phase 2 / 7]

GitHub (`X-Hub-Signature-256`, HMAC-SHA256 with `GITHUB_WEBHOOK_SECRET`) and Stripe signatures
are verified with constant-time comparison over the raw body; deliveries are de-duplicated by
delivery id for idempotency.

## Audit logging [built]

Auth events (login, failed login, logout, reset), organization, membership, invitation, project
and secret changes are recorded with actor, target, IP and redacted metadata. Owners and admins
can read the log in Settings → Organization.

## Known gaps / follow-ups

- No MFA yet (planned with SSO for Enterprise).
- No account lockout beyond rate limiting.
- Session cleanup of expired rows is lazy (on access); add a periodic job.
- Content-Security-Policy for the Next.js app is not yet configured (needs nonce support for
  Next's inline scripts).
