#!/usr/bin/env bash
# Applies supabase/migrations/*.sql in order, once each, each in its own transaction.
# Usage: DB_URL=postgresql://... [EXPECTED_PROJECT_REF=...] scripts/migrate.sh
set -euo pipefail
: "${DB_URL:?DB_URL is required}"

# Safety rails: never touch the existing league project.
if [[ "$DB_URL" == *"cpzfwzmmsgulyciercqz"* ]]; then
  echo "Refusing to run: this URL points at the existing league project." >&2; exit 1
fi
if [[ -n "${EXPECTED_PROJECT_REF:-}" && "$DB_URL" != *"$EXPECTED_PROJECT_REF"* ]]; then
  echo "Refusing to run: the URL does not belong to project $EXPECTED_PROJECT_REF." >&2; exit 1
fi

psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "
  create schema if not exists ci;
  create table if not exists ci.applied_migrations (name text primary key, applied_at timestamptz not null default now());
  alter table ci.applied_migrations enable row level security;"

for f in supabase/migrations/*.sql; do
  name=$(basename "$f")
  if [[ -n "$(psql "$DB_URL" -Atq -v ON_ERROR_STOP=1 -c "select 1 from ci.applied_migrations where name = '$name'")" ]]; then
    echo "skip   $name (already applied)"; continue
  fi
  psql "$DB_URL" -v ON_ERROR_STOP=1 -q --single-transaction -f "$f" \
       -c "insert into ci.applied_migrations (name) values ('$name')"
  echo "applied $name"
done
