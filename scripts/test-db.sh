#!/usr/bin/env bash
# Rebuilds a throwaway local database, applies the migrations, runs the SQL tests.
# Usage: scripts/test-db.sh   (needs a local Postgres reachable via the default socket/env)
set -euo pipefail
DB=${TEST_DB:-survivor_test}
dropdb --if-exists "$DB" 2>/dev/null; createdb "$DB"
psql -d "$DB" -q -v ON_ERROR_STOP=1 -f supabase/tests/00_supabase_stub.sql 2>/dev/null
DB_URL="postgresql:///$DB" ./scripts/migrate.sh >/dev/null
OUT=$(psql -d "$DB" -At -v ON_ERROR_STOP=1 -f supabase/tests/10_rls_and_rules.sql)
echo "--- failures (if any):"
psql -d "$DB" -At -F ' | ' -c "select 'FAIL', label, detail from t.log where not ok order by n" || true
echo "--- all checks:"
psql -d "$DB" -At -F ' | ' -c "select case when ok then 'pass' else 'FAIL' end, label from t.log order by n"
echo "--- summary (passed|failed): $OUT"
[[ "${OUT##*|}" == "0" ]]
