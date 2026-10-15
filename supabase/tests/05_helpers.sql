\set QUIET on
\o /dev/null
create schema t;
grant usage on schema t to anon, authenticated;
create table t.log (n serial, ok boolean, label text, detail text);
grant insert on t.log to anon, authenticated;
grant usage on sequence t.log_n_seq to anon, authenticated;

create function t.ok(q text, label text) returns void language plpgsql as $$
begin execute q; insert into t.log (ok, label) values (true, label);
exception when others then insert into t.log (ok, label, detail) values (false, label, 'unexpected error: ' || sqlerrm); end $$;

create function t.fails(q text, label text) returns void language plpgsql as $$
begin execute q; insert into t.log (ok, label, detail) values (false, label, 'should have been refused');
exception when others then insert into t.log (ok, label, detail) values (true, label, sqlerrm); end $$;

create function t.eq(q text, expected text, label text) returns void language plpgsql as $$
declare v text;
begin execute q into v;
  if v is not distinct from expected then insert into t.log (ok, label) values (true, label);
  else insert into t.log (ok, label, detail) values (false, label, 'expected [' || coalesce(expected,'NULL') || '] got [' || coalesce(v,'NULL') || ']'); end if;
exception when others then insert into t.log (ok, label, detail) values (false, label, 'error: ' || sqlerrm); end $$;

create function t.login(u uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', u::text, false), set_config('role', 'authenticated', false) $$;
create function t.anon() returns void language sql as $$
  select set_config('request.jwt.claim.sub', '', false), set_config('role', 'anon', false) $$;
create function t.root() returns void language sql as $$ select set_config('request.jwt.claim.sub', '', false), set_config('role', session_user::text, false) $$;

create table t.ids (k text primary key, v uuid not null);
grant select on t.ids to anon, authenticated;
create function t.id(k text) returns uuid language sql stable as $$ select v from t.ids where k = $1 $$;
create function t.fx(a text, b text) returns uuid language sql stable security definer as $$
  select id from public.fixtures where (team_a = t.id($1) and team_b = t.id($2)) or (team_a = t.id($2) and team_b = t.id($1)) $$;
create function t.uid(n int) returns uuid language sql immutable as $$ select ('10000000-0000-0000-0000-' || lpad($1::text, 12, '0'))::uuid $$;
\o
