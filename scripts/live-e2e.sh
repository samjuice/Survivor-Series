#!/usr/bin/env bash
# Real end-to-end check against the live API with real sign-in tokens.
# Creates a throwaway owner + player + competition, exercises the flows over HTTP, then deletes everything it created.
set -uo pipefail
: "${DB_URL:?}"; URL=$(grep '^VITE_SUPABASE_URL=' .env.production | cut -d= -f2-); KEY=$(grep '^VITE_SUPABASE_ANON_KEY=' .env.production | cut -d= -f2-)
RUN="ci$(date +%s)"; LEFT=unknown; PW="Aa1-$(openssl rand -hex 10)"
OWN=$(cat /proc/sys/kernel/random/uuid); PLY=$(cat /proc/sys/kernel/random/uuid); PL2=$(cat /proc/sys/kernel/random/uuid)
pass=0; failn=0
q() { psql "$DB_URL" -Atq -v ON_ERROR_STOP=1 "$@"; }
purge() {   # $1 = competition slug pattern, $2 = user email pattern
  q -c "update public.competitions set phase = 'draft', show_table = false, show_fixtures = false where slug ~ '$1'" >/dev/null 2>&1
  q -c "delete from public.competitions where slug ~ '$1'" >/dev/null 2>&1
  q -c "delete from public.audit_log where actor in (select id from auth.users where email like '$2')" >/dev/null 2>&1
  q -c "delete from public.platform_owners where user_id in (select id from auth.users where email like '$2')" >/dev/null 2>&1
  q -c "delete from public.notification_prefs where user_id in (select id from auth.users where email like '$2'); delete from public.profiles where id in (select id from auth.users where email like '$2'); delete from auth.users where email like '$2'" >/dev/null 2>&1
}
leftover() { q -c "select (select count(*) from auth.users where email like 'ci%@ci.invalid') + (select count(*) from public.competitions where slug ~ '^ci[0-9]{10}')" 2>/dev/null; }
cleanup() { purge '^ci[0-9]{10}' 'ci%@ci.invalid'; left=$(leftover); echo "cleanup: leftover rows = ${left:-unknown}"; LEFT=${left:-unknown}; }
purge '^ci[0-9]{10}' 'ci%@ci.invalid'   # remove anything an earlier interrupted run left behind
trap cleanup EXIT
ok()   { echo "pass  $1"; pass=$((pass+1)); }
bad()  { echo "FAIL  $1 :: $2"; failn=$((failn+1)); }
# api <token> <method> <path> [json] -> sets CODE and BODY
api() { local tok=$1 m=$2 p=$3 d=${4:-}; local args=(-s -o /tmp/e2e.out -w '%{http_code}' -X "$m" -H "apikey: $KEY" -H "Authorization: Bearer $tok" -H 'Content-Type: application/json' -H 'Prefer: return=representation'); [[ -n "$d" ]] && args+=(-d "$d"); CODE=$(curl "${args[@]}" "$URL$p"); BODY=$(cat /tmp/e2e.out); }
expect2() { [[ "$CODE" =~ ^2 ]] && ok "$1" || bad "$1" "http $CODE ${BODY:0:160}"; }
expectNo() { [[ "$CODE" =~ ^(4|5) ]] && ok "$1 (refused: $CODE)" || bad "$1" "was allowed: http $CODE ${BODY:0:160}"; }

# 1) create confirmed users directly (the email step is covered separately) and sign them in for real
q <<SQL >/dev/null
do \$\$ declare u uuid; e text; begin
  foreach u in array array['$OWN','$PLY','$PL2']::uuid[] loop
    e := '${RUN}-' || substr(u::text,1,6) || '@ci.invalid';
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
      values ('00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated', e, extensions.crypt('$PW', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());
    insert into public.profiles (id, full_name) values (u, 'CI Test ' || substr(u::text,1,4));
  end loop;
  -- GoTrue cannot read NULL token columns
  perform 1;
  for e in select column_name from information_schema.columns where table_schema='auth' and table_name='users' and column_name in ('confirmation_token','recovery_token','email_change_token_new','email_change','email_change_token_current','reauthentication_token','phone_change','phone_change_token') loop
    execute format('update auth.users set %I = coalesce(%I, '''') where id in (''$OWN'',''$PLY'',''$PL2'')', e, e);
  end loop;
  insert into public.platform_owners (user_id) values ('$OWN');
end \$\$;
SQL
login() { curl -s -X POST -H "apikey: $KEY" -H 'Content-Type: application/json' "$URL/auth/v1/token?grant_type=password" -d "{\"email\":\"$1\",\"password\":\"$PW\"}" | jq -r '.access_token // empty'; }
OE=$(q -c "select email from auth.users where id='$OWN'"); PE=$(q -c "select email from auth.users where id='$PLY'"); P2E=$(q -c "select email from auth.users where id='$PL2'")
OT=$(login "$OE"); PT=$(login "$PE"); P2T=$(login "$P2E")
[[ -n "$OT" && -n "$PT" && -n "$P2T" ]] && ok "real sign-in works for three test users" || { bad "real sign-in" "no token (owner:${#OT} player:${#PT})"; exit 1; }

api "$OT" POST /rest/v1/rpc/my_roles '{}'; [[ "$BODY" == *'"is_owner": true'* || "$BODY" == *'"is_owner":true'* ]] && ok "my_roles reports the owner" || bad "my_roles owner" "$BODY"
api "$PT" POST /rest/v1/rpc/my_roles '{}'; [[ "$BODY" == *'false'* ]] && ok "my_roles reports a plain player" || bad "my_roles player" "$BODY"

# 2) permissions over the real API
api "$PT" POST /rest/v1/competitions "{\"name\":\"x\",\"slug\":\"${RUN}-hack\"}"; expectNo "a player cannot create a competition"
api "$OT" POST /rest/v1/competitions "{\"name\":\"CI test\",\"slug\":\"${RUN}\",\"phase\":\"registration\",\"capacity\":4,\"team_size\":2,\"created_by\":\"$OWN\"}"; expect2 "owner creates a competition"
CID=$(echo "$BODY" | jq -r '.[0].id')
api "$PT" GET "/rest/v1/competitions?id=eq.$CID&select=id"; [[ "$BODY" == *"$CID"* ]] && ok "a player can see an open competition" || bad "player sees competition" "$BODY"
api "$PT" PATCH "/rest/v1/competitions?id=eq.$CID" '{"capacity":99}'; api "$OT" GET "/rest/v1/competitions?id=eq.$CID&select=capacity"; [[ "$BODY" == *'"capacity": 4'* || "$BODY" == *'"capacity":4'* ]] && ok "a player's attempt to change settings changed nothing" || bad "player settings edit" "$BODY"

# 3) registration, payment and approval rules
api "$PT" POST /rest/v1/registrations "{\"competition_id\":\"$CID\",\"user_id\":\"$PLY\"}"; expect2 "a player registers themselves"
RID=$(echo "$BODY" | jq -r '.[0].id')
api "$PT" POST /rest/v1/registrations "{\"competition_id\":\"$CID\",\"user_id\":\"$PL2\",\"status\":\"approved\"}"; expectNo "a player cannot register someone else as approved"
api "$PT" PATCH "/rest/v1/registrations?id=eq.$RID" '{"payment_status":"paid"}'; expectNo "a player cannot confirm their own payment"
api "$PT" PATCH "/rest/v1/registrations?id=eq.$RID" '{"status":"approved"}'; expectNo "a player cannot approve themselves"
api "$P2T" GET "/rest/v1/registrations?select=id"; [[ "$BODY" == "[]" ]] && ok "another player sees none of those registrations" || bad "registration privacy" "$BODY"
api "$OT" PATCH "/rest/v1/registrations?id=eq.$RID" '{"status":"approved","payment_status":"paid"}'; expect2 "owner approves and confirms payment"
api "$P2T" POST /rest/v1/registrations "{\"competition_id\":\"$CID\",\"user_id\":\"$PL2\"}"; expect2 "a second player registers"
R2=$(echo "$BODY" | jq -r '.[0].id'); api "$OT" PATCH "/rest/v1/registrations?id=eq.$R2" '{"status":"approved","payment_status":"paid"}'; expect2 "owner approves the second player"

# 4) tribes, fixtures, scoring rules
api "$OT" POST /rest/v1/teams "[{\"competition_id\":\"$CID\",\"name\":\"Alpha\",\"revealed\":true},{\"competition_id\":\"$CID\",\"name\":\"Bravo\",\"revealed\":true}]"; expect2 "owner creates two tribes"
TA=$(echo "$BODY" | jq -r '.[] | select(.name=="Alpha") | .id'); TB=$(echo "$BODY" | jq -r '.[] | select(.name=="Bravo") | .id')
api "$OT" POST /rest/v1/team_members "[{\"team_id\":\"$TA\",\"registration_id\":\"$RID\",\"is_captain\":true},{\"team_id\":\"$TB\",\"registration_id\":\"$R2\",\"is_captain\":true}]"; expect2 "owner places the captains"
api "$PT" POST /rest/v1/rpc/generate_fixtures "{\"p_competition\":\"$CID\"}"; expectNo "a player cannot generate fixtures"
api "$OT" POST /rest/v1/rpc/generate_fixtures "{\"p_competition\":\"$CID\"}"; [[ "$CODE" =~ ^2 && "$BODY" == "1" ]] && ok "owner generates fixtures (2 tribes, 1 match)" || bad "generate fixtures" "http $CODE $BODY"
api "$OT" PATCH "/rest/v1/competitions?id=eq.$CID" '{"phase":"tribal","show_fixtures":true,"show_table":true}'; expect2 "owner opens the tribal phase"
api "$OT" GET "/rest/v1/fixtures?competition_id=eq.$CID&select=id"; FX=$(echo "$BODY" | jq -r '.[0].id')
for bad_sets in '[[6,5],[6,0],[6,0]]' '[[6,0],[6,0]]' '[[8,6],[6,0],[6,0]]' '[[6,6],[6,0],[6,0]]'; do api "$PT" POST /rest/v1/rpc/submit_result "{\"p_fixture\":\"$FX\",\"p_sets\":$bad_sets}"; expectNo "invalid score $bad_sets is refused"; done
api "$PT" POST /rest/v1/rpc/submit_result "{\"p_fixture\":\"$FX\",\"p_sets\":[[6,0],[3,6],[7,6]]}"; expect2 "captain submits a valid result"
api "$PT" POST /rest/v1/rpc/review_result "{\"p_result\":$(echo "$BODY" | jq -c .),\"p_approve\":true}"; expectNo "a captain cannot approve a result"
api "$PT" GET "/rest/v1/standings?competition_id=eq.$CID&select=points"; [[ "$BODY" != *'"points": 3'* && "$BODY" != *'"points":3'* ]] && ok "a pending result earns no points" || bad "pending counted" "$BODY"
RES=$(q -c "select id from public.results where fixture_id='$FX'")
api "$OT" POST /rest/v1/rpc/review_result "{\"p_result\":\"$RES\",\"p_approve\":true}"; expect2 "owner approves the result"
api "$PT" GET "/rest/v1/standings?competition_id=eq.$CID&select=name,points&order=rank"; [[ "$BODY" == *'"points": 3'* || "$BODY" == *'"points":3'* ]] && ok "standings now show 3 points for the winner" || bad "standings" "$BODY"
api "$PT" POST /rest/v1/feed_events "{\"competition_id\":\"$CID\",\"kind\":\"fake\"}"; expectNo "a player cannot write to the feed"
api "$PT" GET "/rest/v1/feed_events?competition_id=eq.$CID&select=kind,payload"; [[ "$BODY" == *result_approved* && "$BODY" != *paid* && "$BODY" != *payment* ]] && ok "the feed shows the result and no payment details" || bad "feed" "${BODY:0:200}"

# 5) admin-only functions and privacy
for fn in 'regenerate_fixtures:{"p_competition":"'$CID'","p_confirm":true}' 'randomize_captains:{"p_competition":"'$CID'"}' 'list_users:{}' 'publish_awards:{"p_competition":"'$CID'","p_publish":true}' 'create_americano:{"p_competition":"'$CID'","p_kind":"opening","p_name":"x","p_points":24,"p_rounds":[]}' 'record_walkover:{"p_fixture":"'$FX'","p_winner":"'$TA'"}'; do
  api "$PT" POST "/rest/v1/rpc/${fn%%:*}" "${fn#*:}"; expectNo "a player cannot call ${fn%%:*}"; done
api "$PT" GET "/rest/v1/audit_log?select=id"; [[ "$BODY" == "[]" ]] && ok "a player sees an empty audit log" || bad "audit privacy" "${BODY:0:120}"
api "$OT" GET "/rest/v1/audit_log?competition_id=eq.$CID&select=action,entity"; [[ "$BODY" == *registrations* ]] && ok "the owner sees the audit log (it recorded the changes above)" || bad "audit visible to owner" "${BODY:0:120}"
api "$OT" POST /rest/v1/payment_info "{\"competition_id\":\"$CID\",\"instructions\":\"CI bank details 999\"}"; expect2 "owner saves payment instructions"
api "$PT" GET "/rest/v1/payment_info?select=instructions"; [[ "$BODY" == *"CI bank details 999"* ]] && ok "a registered player can read the instructions" || bad "payment info for registrant" "$BODY"
api "$OT" GET "/rest/v1/audit_log?competition_id=eq.$CID&select=details"; [[ "$BODY" != *"bank details 999"* ]] && ok "bank details never reach the audit log" || bad "audit leaked bank details" "leak"
api "$PT" PUT /rest/v1/notification_prefs "{\"user_id\":\"$PLY\",\"results\":false}"; [[ "$CODE" =~ ^2 ]] && ok "a player saves their notification preferences" || { api "$PT" POST "/rest/v1/notification_prefs?on_conflict=user_id" "{\"user_id\":\"$PLY\",\"results\":false}"; expect2 "a player saves their notification preferences"; }
cleanup
[[ "$LEFT" == "0" ]] && ok "all test data was removed again (0 rows left)" || bad "cleanup" "leftover rows: $LEFT"
echo "---- e2e: $pass passed, $failn failed"
[[ $failn -eq 0 ]]
