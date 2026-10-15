-- 0003_hardening: Supabase grants extra default privileges to anon/authenticated.
-- Keep only what each role needs (explicit grants live in 0001/0002).

-- 1) Tables and views: no TRUNCATE / REFERENCES / TRIGGER for API roles.
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke truncate, references, trigger on tables from anon, authenticated;

-- 2) Functions: nothing callable by anon or PUBLIC; authenticated only gets the intended helpers and RPCs.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
  loop
    execute format('revoke all on function %s from public, anon', r.sig);
    if r.proname like 'trg\_%' or r.proname in ('add_feed', '_make_walkover', 'is_valid_set') then
      execute format('revoke all on function %s from authenticated', r.sig);
    end if;
  end loop;
end $$;
alter default privileges in schema public revoke execute on functions from public, anon;
