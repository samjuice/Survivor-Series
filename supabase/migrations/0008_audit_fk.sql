-- 0008: deleting a competition cascades to registrations/teams, whose audit triggers then log against the
-- competition that is being deleted. A foreign key there made the whole delete fail. The audit trail must
-- outlive its competition anyway, so the column becomes a plain id (rows for deleted competitions stay owner-only).
alter table public.audit_log drop constraint if exists audit_log_competition_id_fkey;

-- Deleting a whole competition cascades to teams, registrations, fixtures, line-ups and Americano rows at once.
-- References between those rows are checked at commit instead of mid-cascade, so the cascade can remove them
-- together. Deleting ONE registration or tribe that is still in use is still refused (at commit).
do $$
declare c record;
begin
  for c in
    select conrelid::regclass as tbl, conname from pg_constraint
    where contype = 'f' and connamespace = 'public'::regnamespace and confdeltype = 'a' and not condeferrable
      and confrelid in ('public.registrations'::regclass, 'public.teams'::regclass)
  loop
    execute format('alter table %s alter constraint %I deferrable initially deferred', c.tbl, c.conname);
  end loop;
end $$;
