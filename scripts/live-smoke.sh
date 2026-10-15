#!/usr/bin/env bash
# Calls the live Supabase API as an anonymous visitor and checks that it refuses everything it should.
# Reads the public URL and publishable key from .env.production. No secrets involved.
set -uo pipefail
URL=$(grep '^VITE_SUPABASE_URL=' .env.production | cut -d= -f2-); KEY=$(grep '^VITE_SUPABASE_ANON_KEY=' .env.production | cut -d= -f2-)
fail=0
code() { curl -s -o /tmp/smoke.out -w '%{http_code}' -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' "$@"; }
expect_ok()     { c=$(code "${@:2}"); if [[ "$c" =~ ^2 ]]; then echo "pass  $1 ($c)"; else echo "FAIL  $1 (got $c, wanted 2xx)"; fail=1; fi; }
expect_denied() { c=$(code "${@:2}"); if [[ "$c" =~ ^(401|403|404)$ ]]; then echo "pass  $1 ($c)"; else echo "FAIL  $1 (got $c, wanted 401/403/404)"; cat /tmp/smoke.out | head -c 200; fail=1; fi; }
ZERO=00000000-0000-0000-0000-000000000000
expect_ok     "anon can read public competitions"            "$URL/rest/v1/competitions?select=id&limit=1"
expect_denied "anon cannot read registrations"               "$URL/rest/v1/registrations?select=id&limit=1"
expect_denied "anon cannot read profiles"                    "$URL/rest/v1/profiles?select=id&limit=1"
expect_denied "anon cannot read platform_owners"             "$URL/rest/v1/platform_owners?select=user_id&limit=1"
expect_denied "anon cannot read payment instructions"        "$URL/rest/v1/payment_info?select=instructions&limit=1"
expect_denied "anon cannot read teams"                       "$URL/rest/v1/teams?select=id&limit=1"
expect_denied "anon cannot read results"                     "$URL/rest/v1/results?select=id&limit=1"
expect_denied "anon cannot create a competition"             -X POST "$URL/rest/v1/competitions" -d '{"name":"x","slug":"x"}'
expect_denied "anon cannot become a platform owner"          -X POST "$URL/rest/v1/platform_owners" -d "{\"user_id\":\"$ZERO\"}"
expect_denied "anon cannot call generate_fixtures"           -X POST "$URL/rest/v1/rpc/generate_fixtures" -d "{\"p_competition\":\"$ZERO\"}"
expect_denied "anon cannot call submit_result"               -X POST "$URL/rest/v1/rpc/submit_result" -d "{\"p_fixture\":\"$ZERO\",\"p_sets\":[[6,0],[6,0],[6,0]]}"
expect_denied "anon cannot call review_result"               -X POST "$URL/rest/v1/rpc/review_result" -d "{\"p_result\":\"$ZERO\",\"p_approve\":true}"
expect_denied "anon cannot call add_feed"                    -X POST "$URL/rest/v1/rpc/add_feed" -d "{\"p_competition\":\"$ZERO\",\"p_kind\":\"x\",\"p_payload\":{}}"
expect_denied "anon cannot call my_roles"                    -X POST "$URL/rest/v1/rpc/my_roles" -d '{}'
expect_denied "anon cannot read the audit log"              "$URL/rest/v1/audit_log?select=id&limit=1"
expect_denied "anon cannot read awards"                      "$URL/rest/v1/awards?select=id&limit=1"
expect_denied "anon cannot read votes"                       "$URL/rest/v1/award_votes?select=nominee_id&limit=1"
expect_denied "anon cannot read award results"               "$URL/rest/v1/award_results?select=winner_id&limit=1"
expect_denied "anon cannot read lineups"                     "$URL/rest/v1/lineups?select=fixture_id&limit=1"
expect_denied "anon cannot read americano events"            "$URL/rest/v1/americano_events?select=id&limit=1"
expect_denied "anon cannot read americano matches"           "$URL/rest/v1/americano_matches?select=id&limit=1"
expect_denied "anon cannot read americano standings"         "$URL/rest/v1/americano_standings?select=name&limit=1"
expect_denied "anon cannot read notification prefs"          "$URL/rest/v1/notification_prefs?select=user_id&limit=1"
expect_denied "anon cannot list users"                       -X POST "$URL/rest/v1/rpc/list_users" -d '{}'
expect_denied "anon cannot delete users"                     -X POST "$URL/rest/v1/rpc/delete_user" -d "{\"p_user\":\"$ZERO\",\"p_confirm\":true}"
expect_denied "anon cannot suspend users"                    -X POST "$URL/rest/v1/rpc/set_user_status" -d "{\"p_user\":\"$ZERO\",\"p_status\":\"suspended\"}"
expect_denied "anon cannot add admins"                       -X POST "$URL/rest/v1/rpc/add_competition_admin" -d "{\"p_competition\":\"$ZERO\",\"p_email\":\"a@b.co\"}"
expect_denied "anon cannot assign tribes"                    -X POST "$URL/rest/v1/rpc/assign_tribes" -d "{\"p_competition\":\"$ZERO\",\"p_assignments\":[]}"
expect_denied "anon cannot regenerate fixtures"              -X POST "$URL/rest/v1/rpc/regenerate_fixtures" -d "{\"p_competition\":\"$ZERO\",\"p_confirm\":true}"
expect_denied "anon cannot set a line-up"                    -X POST "$URL/rest/v1/rpc/set_lineup" -d "{\"p_fixture\":\"$ZERO\",\"p_team\":\"$ZERO\",\"p_reg1\":\"$ZERO\",\"p_reg2\":\"$ZERO\"}"
expect_denied "anon cannot create an Americano"              -X POST "$URL/rest/v1/rpc/create_americano" -d "{\"p_competition\":\"$ZERO\",\"p_kind\":\"opening\",\"p_name\":\"x\",\"p_points\":24,\"p_rounds\":[]}"
expect_denied "anon cannot vote"                             -X POST "$URL/rest/v1/rpc/cast_vote" -d "{\"p_award\":\"$ZERO\",\"p_nominee\":\"$ZERO\"}"
expect_denied "anon cannot publish awards"                   -X POST "$URL/rest/v1/rpc/publish_awards" -d "{\"p_competition\":\"$ZERO\",\"p_publish\":true}"
exit $fail
