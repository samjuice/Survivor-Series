#!/usr/bin/env bash
# One-time: make the user with OWNER_EMAIL the platform owner. Refuses if an owner already exists.
set -euo pipefail
: "${DB_URL:?DB_URL is required}" "${OWNER_EMAIL:?OWNER_EMAIL is required}"
if [[ "$DB_URL" == *"cpzfwzmmsgulyciercqz"* ]]; then echo "Refusing: that is the existing league project." >&2; exit 1; fi
if [[ -n "${EXPECTED_PROJECT_REF:-}" && "$DB_URL" != *"$EXPECTED_PROJECT_REF"* ]]; then echo "Refusing: wrong project." >&2; exit 1; fi
existing=$(psql "$DB_URL" -Atq -v ON_ERROR_STOP=1 -c "select count(*) from public.platform_owners")
if [[ "$existing" != "0" ]]; then echo "A platform owner already exists. Nothing changed." >&2; exit 1; fi
added=$(psql "$DB_URL" -Atq -v ON_ERROR_STOP=1 -v email="$OWNER_EMAIL" <<'SQL'
with ins as (
  insert into public.platform_owners (user_id)
  select id from auth.users where lower(email) = lower(:'email') and email_confirmed_at is not null
  returning user_id)
select count(*) from ins;
SQL
)
if [[ "$added" != "1" ]]; then echo "No confirmed account found for that email. Sign up in the app, confirm the email, then run this again." >&2; exit 1; fi
echo "Platform owner set."
