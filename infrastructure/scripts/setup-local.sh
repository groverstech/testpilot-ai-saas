#!/usr/bin/env bash
# One-shot local setup WITHOUT Docker (uses locally installed PostgreSQL + Redis).
# Idempotent: safe to re-run. Never touches databases other than the three below.
set -euo pipefail
cd "$(dirname "$0")/../.."

if [ ! -f .env ]; then
  key=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
  sed "s#^ENCRYPTION_KEYS=#ENCRYPTION_KEYS=dev:${key}#" .env.example > .env
  echo "Created .env with a fresh development encryption key"
fi

if command -v psql >/dev/null 2>&1; then
  for db in testpilot testpilot_test testpilot_e2e; do
    if ! psql "postgresql://testpilot:testpilot@localhost:5432/postgres" -tAc "SELECT 1 FROM pg_database WHERE datname='${db}'" | grep -q 1; then
      psql "postgresql://testpilot:testpilot@localhost:5432/postgres" -c "CREATE DATABASE ${db}" && echo "Created database ${db}"
    fi
  done
fi

pnpm install
set -a; . ./.env; set +a
pnpm db:migrate
echo "Done. Start everything with: pnpm dev"
