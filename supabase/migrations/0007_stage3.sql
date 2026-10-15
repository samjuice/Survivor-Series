-- 0007_stage3: audit log, awards + optional voting (never touches points), notification preferences.

-- ───────────────────────── Audit log ─────────────────────────
create table public.audit_log (
  id bigint generated always as identity primary key,
  competition_id uuid references public.competitions(id) on delete set null,
  actor uuid,
  actor_name text,
  action text not null,
  entity text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_comp_idx on public.audit_log (competition_id, id desc);
alter table public.audit_log enable row level security;
create policy audit_select on public.audit_log for select to authenticated
  using ((competition_id is not null and public.is_comp_admin(competition_id)) or public.is_platform_owner());
grant select on public.audit_log to authenticated;     -- written only by triggers

create function public.trg_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare o jsonb; n jsonb; rec jsonb; cid uuid; ch jsonb; act text; who text;
  noise text[] := array['created_at', 'updated_at', 'revealed_at', 'paid_at', 'scored_at', 'reviewed_at'];
begin
  o := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  n := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  rec := coalesce(n, o);
  cid := case tg_table_name
    when 'competitions' then (rec ->> 'id')::uuid
    when 'team_members' then (select t.competition_id from public.teams t where t.id = (rec ->> 'team_id')::uuid)
    when 'profiles' then null
    else nullif(rec ->> 'competition_id', '')::uuid end;
  act := case tg_op when 'INSERT' then 'created' when 'UPDATE' then 'updated' else 'deleted' end;
  if tg_table_name = 'profiles' then
    if tg_op <> 'UPDATE' or new.status is not distinct from old.status then return null; end if;
    select full_name into who from public.profiles where id = auth.uid();
    ch := jsonb_build_object('status', jsonb_build_object('from', old.status, 'to', new.status));
    insert into public.audit_log (competition_id, actor, actor_name, action, entity, entity_id, details)
      select c.cid, auth.uid(), who, 'status_changed', 'profiles', new.id::text, ch
      from (select distinct competition_id as cid from public.registrations where user_id = new.id
            union select null::uuid where not exists (select 1 from public.registrations where user_id = new.id)) c;
    return null;
  elsif tg_table_name = 'payment_info' then
    ch := jsonb_build_object('changed', 'payment instructions');            -- never store bank details here
  elsif tg_op = 'UPDATE' then
    select jsonb_object_agg(e.key, jsonb_build_object('from', o -> e.key, 'to', e.value)) into ch
      from jsonb_each(n) e where (o -> e.key) is distinct from e.value and e.key <> all (noise);
    if ch is null then return null; end if;
  else
    ch := rec - noise;
  end if;
  select full_name into who from public.profiles where id = auth.uid();
  insert into public.audit_log (competition_id, actor, actor_name, action, entity, entity_id, details)
    values (cid, auth.uid(), who, act, tg_table_name, coalesce(rec ->> 'id', rec ->> 'user_id', rec ->> 'registration_id', rec ->> 'fixture_id'), coalesce(ch, '{}'::jsonb));
  return null;
end $$;

-- Generated fixtures are logged as one line, not one per match.
create function public.trg_audit_fixtures_ins() returns trigger
language plpgsql security definer set search_path = '' as $$
declare who text; r record;
begin
  select full_name into who from public.profiles where id = auth.uid();
  for r in select competition_id, count(*)::int as n from newt group by competition_id loop
    -- statements inside one transaction (one generate/regenerate call) share one log line
    update public.audit_log set details = jsonb_build_object('count', (details ->> 'count')::int + r.n)
      where action = 'fixtures_created' and competition_id = r.competition_id and created_at = now() and actor is not distinct from auth.uid();
    if not found then
      insert into public.audit_log (competition_id, actor, actor_name, action, entity, details)
        values (r.competition_id, auth.uid(), who, 'fixtures_created', 'fixtures', jsonb_build_object('count', r.n));
    end if;
  end loop;
  return null;
end $$;
create function public.trg_audit_fixtures_del() returns trigger
language plpgsql security definer set search_path = '' as $$
declare who text; r record;
begin
  select full_name into who from public.profiles where id = auth.uid();
  for r in select competition_id, count(*)::int as n from oldt group by competition_id loop
    update public.audit_log set details = jsonb_build_object('count', (details ->> 'count')::int + r.n)
      where action = 'fixtures_deleted' and competition_id = r.competition_id and created_at = now() and actor is not distinct from auth.uid();
    if not found then
      insert into public.audit_log (competition_id, actor, actor_name, action, entity, details)
        values (r.competition_id, auth.uid(), who, 'fixtures_deleted', 'fixtures', jsonb_build_object('count', r.n));
    end if;
  end loop;
  return null;
end $$;
create trigger audit_fixtures_ins after insert on public.fixtures referencing new table as newt for each statement execute function public.trg_audit_fixtures_ins();
create trigger audit_fixtures_del after delete on public.fixtures referencing old table as oldt for each statement execute function public.trg_audit_fixtures_del();
create trigger audit_fixtures_upd after update on public.fixtures for each row execute function public.trg_audit();

create trigger audit_competitions after insert or update or delete on public.competitions for each row execute function public.trg_audit();
create trigger audit_competition_admins after insert or delete on public.competition_admins for each row execute function public.trg_audit();
create trigger audit_registrations after insert or update or delete on public.registrations for each row execute function public.trg_audit();
create trigger audit_teams after insert or update or delete on public.teams for each row execute function public.trg_audit();
create trigger audit_team_members after insert or update or delete on public.team_members for each row execute function public.trg_audit();
create trigger audit_results after insert or update or delete on public.results for each row execute function public.trg_audit();
create trigger audit_announcements after insert or update or delete on public.announcements for each row execute function public.trg_audit();
create trigger audit_payment_info after insert or update on public.payment_info for each row execute function public.trg_audit();
create trigger audit_profiles after update on public.profiles for each row execute function public.trg_audit();
create trigger audit_lineups after insert or update on public.lineups for each row execute function public.trg_audit();
create trigger audit_americano_events after insert or update or delete on public.americano_events for each row execute function public.trg_audit();
create trigger audit_americano_matches after update on public.americano_matches for each row execute function public.trg_audit();

-- ───────────────────────── Awards and voting (never changes points) ─────────────────────────
create table public.awards (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  description text not null default '',
  nominee_kind text not null default 'player' check (nominee_kind in ('player', 'tribe')),
  voting_open boolean not null default false,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create table public.award_results (          -- admin-only until published
  award_id uuid primary key references public.awards(id) on delete cascade,
  competition_id uuid not null references public.competitions(id) on delete cascade,
  winner_id uuid not null,
  published boolean not null default false
);
create table public.award_votes (            -- secret ballot: you can only ever read your own vote
  award_id uuid not null references public.awards(id) on delete cascade,
  voter uuid not null references auth.users(id),
  nominee_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (award_id, voter)
);
alter table public.awards enable row level security;
alter table public.award_results enable row level security;
alter table public.award_votes enable row level security;
create policy awards_select on public.awards for select to authenticated
  using (public.is_comp_admin(competition_id)
         or (public.is_comp_member(competition_id)
             and (voting_open or exists (select 1 from public.award_results r where r.award_id = id and r.published))));
create policy awards_write_admin on public.awards for all to authenticated
  using (public.is_comp_admin(competition_id)) with check (public.is_comp_admin(competition_id));
create policy award_results_select on public.award_results for select to authenticated using (public.is_comp_admin(competition_id));
create policy award_votes_select on public.award_votes for select to authenticated using (voter = auth.uid());
grant select on public.awards, public.award_results, public.award_votes to authenticated;
grant insert (competition_id, title, description, nominee_kind, sort) on public.awards to authenticated;
grant update (title, description, nominee_kind, voting_open, sort) on public.awards to authenticated;
grant delete on public.awards to authenticated;

create function public.cast_vote(p_award uuid, p_nominee uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.awards; my_reg uuid; ok boolean;
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  select * into a from public.awards where id = p_award;
  if not found then raise exception 'Award not found' using errcode = 'P0002'; end if;
  if not public.is_active_user() or not public.is_comp_member(a.competition_id) then
    raise exception 'Only approved players can vote' using errcode = '42501';
  end if;
  if not a.voting_open then raise exception 'Voting is closed for this award' using errcode = '23514'; end if;
  select id into my_reg from public.registrations where competition_id = a.competition_id and user_id = auth.uid();
  if a.nominee_kind = 'player' then
    ok := exists (select 1 from public.registrations where id = p_nominee and competition_id = a.competition_id and status = 'approved');
    if p_nominee = my_reg then raise exception 'You can''t vote for yourself' using errcode = '23514'; end if;
  else
    ok := exists (select 1 from public.teams where id = p_nominee and competition_id = a.competition_id);
    if exists (select 1 from public.team_members where team_id = p_nominee and registration_id = my_reg and left_at is null) then
      raise exception 'You can''t vote for your own tribe' using errcode = '23514';
    end if;
  end if;
  if not ok then raise exception 'That is not a valid nominee for this award' using errcode = '22023'; end if;
  insert into public.award_votes (award_id, voter, nominee_id) values (p_award, auth.uid(), p_nominee)
    on conflict (award_id, voter) do update set nominee_id = excluded.nominee_id, created_at = now();
end $$;

create function public.award_tally(p_award uuid) returns table (nominee_id uuid, name text, votes int)
language plpgsql stable security definer set search_path = '' as $$
declare a public.awards;
begin
  select * into a from public.awards where id = p_award;
  if not found then raise exception 'Award not found' using errcode = 'P0002'; end if;
  if not public.is_comp_admin(a.competition_id) then raise exception 'Only an administrator can see the tally' using errcode = '42501'; end if;
  return query
    select v.nominee_id,
      case when a.nominee_kind = 'player'
        then (select coalesce(r.placeholder_name, p.display_name, p.full_name, 'Player') from public.registrations r left join public.profiles p on p.id = r.user_id where r.id = v.nominee_id)
        else (select t.name from public.teams t where t.id = v.nominee_id) end,
      count(*)::int
    from public.award_votes v where v.award_id = p_award group by v.nominee_id order by count(*) desc, 2;
end $$;

create function public.set_award_winner(p_award uuid, p_winner uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.awards; ok boolean;
begin
  select * into a from public.awards where id = p_award;
  if not found then raise exception 'Award not found' using errcode = 'P0002'; end if;
  if not public.is_comp_admin(a.competition_id) then raise exception 'Only an administrator can choose winners' using errcode = '42501'; end if;
  if a.nominee_kind = 'player' then ok := exists (select 1 from public.registrations where id = p_winner and competition_id = a.competition_id and status = 'approved');
  else ok := exists (select 1 from public.teams where id = p_winner and competition_id = a.competition_id); end if;
  if not ok then raise exception 'That winner is not valid for this award' using errcode = '22023'; end if;
  insert into public.award_results (award_id, competition_id, winner_id) values (p_award, a.competition_id, p_winner)
    on conflict (award_id) do update set winner_id = excluded.winner_id;
end $$;

create function public.publish_awards(p_competition uuid, p_publish boolean) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not public.is_comp_admin(p_competition) then raise exception 'Only an administrator can publish awards' using errcode = '42501'; end if;
  update public.award_results set published = p_publish where competition_id = p_competition;
  get diagnostics n = row_count;
  if p_publish then
    update public.awards set voting_open = false where competition_id = p_competition;
    if n > 0 then perform public.add_feed(p_competition, 'awards_published', jsonb_build_object('count', n)); end if;
  end if;
  return n;
end $$;

-- Winners: everyone approved sees published winners; admins also see unpublished ones. Vote counts are never exposed here.
create view public.award_winners as
select a.id as award_id, a.competition_id, a.title, a.description, a.nominee_kind, a.sort, r.winner_id, r.published,
  case when a.nominee_kind = 'player'
    then (select coalesce(x.placeholder_name, p.display_name, p.full_name, 'Player') from public.registrations x left join public.profiles p on p.id = x.user_id where x.id = r.winner_id)
    else (select t.name from public.teams t where t.id = r.winner_id) end as winner_name,
  case when a.nominee_kind = 'tribe' then (select t.emblem_key from public.teams t where t.id = r.winner_id) end as emblem_key,
  case when a.nominee_kind = 'tribe' then (select t.color from public.teams t where t.id = r.winner_id) end as color
from public.awards a join public.award_results r on r.award_id = a.id
where public.is_comp_admin(a.competition_id) or (r.published and public.is_comp_member(a.competition_id));
grant select on public.award_winners to authenticated;

-- Voting needs to show nominees without exposing registrations: a names-only list of who can be voted for.
create view public.vote_nominees as
select a.id as award_id, a.nominee_kind, r.id as nominee_id,
  coalesce(r.placeholder_name, p.display_name, p.full_name, 'Player') as name, null::text as emblem_key, null::text as color
from public.awards a
join public.registrations r on r.competition_id = a.competition_id and r.status = 'approved'
left join public.profiles p on p.id = r.user_id
where a.nominee_kind = 'player' and a.voting_open and public.is_comp_member(a.competition_id)
union all
select a.id, a.nominee_kind, t.id, t.name, t.emblem_key, t.color
from public.awards a join public.teams t on t.competition_id = a.competition_id
where a.nominee_kind = 'tribe' and a.voting_open and public.is_comp_member(a.competition_id) and t.revealed;
grant select on public.vote_nominees to authenticated;

-- ───────────────────────── Notification preferences (in-app) ─────────────────────────
create table public.notification_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  results boolean not null default true,
  fixtures boolean not null default true,
  announcements boolean not null default true,
  reveals boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.notification_prefs enable row level security;
create policy prefs_own on public.notification_prefs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert on public.notification_prefs to authenticated;
grant update (results, fixtures, announcements, reveals, updated_at) on public.notification_prefs to authenticated;

-- ───────────────────────── Grants, realtime ─────────────────────────
revoke all on function public.cast_vote(uuid, uuid), public.award_tally(uuid), public.set_award_winner(uuid, uuid), public.publish_awards(uuid, boolean) from public, anon;
grant execute on function public.cast_vote(uuid, uuid), public.award_tally(uuid), public.set_award_winner(uuid, uuid), public.publish_awards(uuid, boolean) to authenticated;
revoke all on function public.trg_audit(), public.trg_audit_fixtures_ins(), public.trg_audit_fixtures_del() from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.awards, public.award_results;
  end if;
end $$;
