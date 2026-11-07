# Security

The full security model (trust boundaries, controls, and how each is verified) is in
[`../architecture/security-model.md`](../architecture/security-model.md).

## Automated security tests

| Suite | Covers |
|---|---|
| `tests/security/security.test.ts` | CSRF header + origin checks, no CORS, cookie flags, forged sessions, security headers, error hygiene, no hash leakage, body limits, id validation, login rate limiting, open-redirect guard |
| `tests/integration/tenancy-rbac.test.ts` | Cross-tenant reads/writes, header override abuse, per-role permissions, privilege escalation, immediate revocation |
| `tests/integration/auth.test.ts` | Enumeration-safe login/reset, single-use expiring tokens, session revocation |
| `tests/integration/projects.test.ts` | SSRF rejection, secrets encrypted at rest and never returned or audited |
| `tests/unit/*.test.ts` | AES-GCM (tamper, AAD binding, rotation), scrypt, SSRF address classification, redaction |

## Pre-production checklist

- [ ] `NODE_ENV=production`, `COOKIE_SECURE=true`, HTTPS everywhere, `TRUST_PROXY=true` behind the LB
- [ ] `ENCRYPTION_KEYS` generated per environment and stored in a secrets manager; rotation runbook tested
- [ ] `SMTP_URL` configured with SPF/DKIM/DMARC on the sending domain
- [ ] `REDIS_URL` set so rate limits are shared across API replicas
- [ ] Database: TLS, least-privilege app role (no superuser), automated backups + PITR
- [ ] Only the web service public; API reachable via the web rewrite (plus webhook paths when added)
- [ ] Execution-plane isolation and egress policy in place **before** Phase 2–4 features run customer code
- [ ] Dependency and container image scanning in CI

## Reporting a vulnerability

Please report suspected vulnerabilities privately to the maintainers rather than opening a
public issue.
