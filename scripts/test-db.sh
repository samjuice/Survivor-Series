#!/usr/bin/env bash
# Rebuilds a throwaway local database, applies the migrations, runs every SQL test file in order.
set -euo pipefail
DB=${TEST_DB:-survivor_test}
dropdb --if-exists "$DB" 2>/dev/null; createdb "$DB"
psql -d "$DB" -q -v ON_ERROR_STOP=1 -f supabase/tests/00_supabase_stub.sql 2>/dev/null
DB_URL="postgresql:///$DB" ./scripts/migrate.sh >/dev/null
psql -d "$DB" -q -v ON_ERROR_STOP=1 -f supabase/tests/05_helpers.sql
for f in supabase/tests/[1-9]*_*.sql; do psql -d "$DB" -q -v ON_ERROR_STOP=1 -f "$f" >/dev/null; done
echo "--- failures (if any):"
psql -d "$DB" -At -F ' | ' -c "select 'FAIL', label, detail from t.log where not ok order by n" || true
[[ -n "${VERBOSE:-}" ]] && psql -d "$DB" -At -F ' | ' -c "select case when ok then 'pass' else 'FAIL' end, label from t.log order by n"
OUT=$(psql -d "$DB" -At -F '|' -c "select count(*) filter (where ok), count(*) filter (where not ok) from t.log")
echo "--- summary (passed|failed): $OUT"
[[ "${OUT##*|}" == "0" ]]
