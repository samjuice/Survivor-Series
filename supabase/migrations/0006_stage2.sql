-- 0006_stage2: opening Americano, random tribes, captains, reveal, lineups, appearances, safe regeneration.

-- ───────────────────────── Tribe reveal ─────────────────────────
alter table public.teams add column revealed_at timestamptz;

create function public.trg_team_reveal() returns trigger language plpgsql as $$
begin
  if new.revealed and (tg_op = 'INSERT' or not old.revealed) then new.revealed_at := now();
  elsif not new.revealed then new.revealed_at := null; end if;
  return new;
end $$;
create trigger team_reveal before insert or update of revealed on public.teams
  for each row execute function public.trg_team_reveal();

create function public.trg_team_reveal_feed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.revealed and not old.revealed then
    perform public.add_feed(new.competition_id, 'tribe_revealed',
      jsonb_build_object('team_id', new.id, 'name', new.name, 'emblem', new.emblem_key, 'color', new.color));
  end if;
  return null;
end $$;
create trigger team_reveal_feed after update of revealed on public.teams
  for each row execute function public.trg_team_reveal_feed();

-- ───────────────────────── Random tribes: the client previews, the server validates and applies ─────────────────────────
create function public.assign_tribes(p_competition uuid, p_assignments jsonb, p_clear boolean default false, p_confirm boolean default false) returns int
language plpgsql security definer set search_path = '' as $$
declare a jsonb; rid text; tid uuid; n int := 0;
begin
  if not public.is_comp_admin(p_competition) then raise exception 'Only an administrator can assign tribes' using errcode = '42501'; end if;
  if p_assignments is null or jsonb_typeof(p_assignments) <> 'array' then raise exception 'Assignments must be a list' using errcode = '22023'; end if;
  if p_clear then
    if p_confirm is not true then
      raise exception 'Confirmation required: this takes everyone off their current tribes first' using errcode = '22023';
    end if;
    update public.team_members set left_at = now(), is_captain = false
      where left_at is null and team_id in (select id from public.teams where competition_id = p_competition);
  end if;
  for a in select * from jsonb_array_elements(p_assignments) loop
    tid := (a ->> 'team_id')::uuid;
    if not exists (select 1 from public.teams where id = tid and competition_id = p_competition and status = 'active') then
      raise exception 'Unknown or withdrawn tribe in the assignment' using errcode = '22023';
    end if;
    for rid in select jsonb_array_elements_text(a -> 'registrations') loop
      begin
        insert into public.team_members (team_id, registration_id) values (tid, rid::uuid);
      exception when unique_violation then
        raise exception 'Someone in this assignment is already on a tribe. Start again to reshuffle everyone.' using errcode = '23514';
      end;
      n := n + 1;
    end loop;
  end loop;
  return n;
end $$;

create function public.randomize_captains(p_competition uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare t record; m uuid; n int := 0;
begin
  if not public.is_comp_admin(p_competition) then raise exception 'Only an administrator can pick captains' using errcode = '42501'; end if;
  for t in select id from public.teams where competition_id = p_competition and status = 'active'
           and not exists (select 1 from public.team_members x where x.team_id = teams.id and x.is_captain and x.left_at is null) loop
    select id into m from public.team_members where team_id = t.id and left_at is null order by random() limit 1;
    if m is not null then update public.team_members set is_captain = true where id = m; n := n + 1; end if;
  end loop;
  return n;
end $$;

-- ───────────────────────── Tribal Warfare lineups (captains pick two representatives) ─────────────────────────
create table public.lineups (
  competition_id uuid not null references public.competitions(id) on delete cascade,
  fixture_id uuid not null references public.fixtures(id) on delete cascade,
  team_id uuid not null references public.teams(id),
  reg1 uuid not null references public.registrations(id),
  reg2 uuid not null references public.registrations(id),
  submitted_by uuid references auth.users(id),
  locked boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (fixture_id, team_id),
  check (reg1 <> reg2)
);
alter table public.lineups enable row level security;
-- Your own tribe and admins always see it; everyone else only once it is locked or the match is settled.
create policy lineups_select on public.lineups for select to authenticated using (
  public.is_comp_admin(competition_id) or public.is_team_member(team_id)
  or (public.comp_shows_fixtures(competition_id)
      and (locked or exists (select 1 from public.fixtures f where f.id = fixture_id and f.status in ('played', 'walkover')))));
grant select on public.lineups to authenticated;

create function public.set_lineup(p_fixture uuid, p_team uuid, p_reg1 uuid, p_reg2 uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare f public.fixtures; c public.competitions; is_admin boolean; ex public.lineups;
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  select * into f from public.fixtures where id = p_fixture;
  if not found then raise exception 'Fixture not found' using errcode = 'P0002'; end if;
  if p_team not in (f.team_a, f.team_b) then raise exception 'That tribe is not playing in this match' using errcode = '22023'; end if;
  select * into c from public.competitions where id = f.competition_id;
  is_admin := public.is_comp_admin(f.competition_id);
  if not is_admin then
    if not public.is_active_user() then raise exception 'Your account is not active' using errcode = '42501'; end if;
    if not public.is_team_captain(p_team) then raise exception 'Only this tribe''s captain, or an admin, can pick the two players' using errcode = '42501'; end if;
    if c.phase not in ('opening', 'tribal', 'finale') then raise exception 'Line-ups can''t be set in the current phase' using errcode = '42501'; end if;
  end if;
  if f.status <> 'scheduled' then raise exception 'Line-ups can only be set before the match is played' using errcode = '23514'; end if;
  if p_reg1 = p_reg2 then raise exception 'Pick two different players' using errcode = '22023'; end if;
  if (select count(*) from public.team_members where team_id = p_team and left_at is null and registration_id in (p_reg1, p_reg2)) <> 2 then
    raise exception 'Both players must be on this tribe' using errcode = '22023';
  end if;
  select * into ex from public.lineups where fixture_id = p_fixture and team_id = p_team;
  if found and ex.locked and not is_admin then raise exception 'This line-up is locked' using errcode = '42501'; end if;
  insert into public.lineups (competition_id, fixture_id, team_id, reg1, reg2, submitted_by)
    values (f.competition_id, p_fixture, p_team, p_reg1, p_reg2, auth.uid())
    on conflict (fixture_id, team_id) do update set reg1 = excluded.reg1, reg2 = excluded.reg2, submitted_by = excluded.submitted_by, updated_at = now();
end $$;

create function public.lock_lineups(p_fixture uuid, p_locked boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare cid uuid;
begin
  select competition_id into cid from public.fixtures where id = p_fixture;
  if cid is null then raise exception 'Fixture not found' using errcode = 'P0002'; end if;
  if not public.is_comp_admin(cid) then raise exception 'Only an administrator can lock line-ups' using errcode = '42501'; end if;
  update public.lineups set locked = p_locked where fixture_id = p_fixture;
end $$;

-- Appearance tracking: only your own tribe and admins can see it.
create view public.player_appearances as
select t.competition_id, tm.team_id, tm.registration_id,
  coalesce(r.placeholder_name, p.display_name, p.full_name, 'Player') as name,
  (select count(*) from public.lineups l join public.fixtures f on f.id = l.fixture_id
     where l.team_id = tm.team_id and tm.registration_id in (l.reg1, l.reg2) and f.status = 'played')::int as played,
  (select count(*) from public.lineups l join public.fixtures f on f.id = l.fixture_id
     where l.team_id = tm.team_id and tm.registration_id in (l.reg1, l.reg2) and f.status = 'scheduled')::int as upcoming
from public.team_members tm
join public.teams t on t.id = tm.team_id
join public.registrations r on r.id = tm.registration_id
left join public.profiles p on p.id = r.user_id
where tm.left_at is null and (public.is_comp_admin(t.competition_id) or public.is_team_member(tm.team_id));
grant select on public.player_appearances to authenticated;

-- ───────────────────────── Fixture regeneration that never destroys approved scores ─────────────────────────
create function public.regenerate_fixtures(p_competition uuid, p_confirm boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare kept int; removed int; made int := 0; r record; rnd int;
begin
  if not public.is_comp_admin(p_competition) then raise exception 'Only an administrator can regenerate fixtures' using errcode = '42501'; end if;
  if p_confirm is not true then
    raise exception 'Confirmation required: unplayed matches (and any times set on them) are rebuilt. Played matches and approved scores are never touched.' using errcode = '22023';
  end if;
  select count(*) into kept from public.fixtures where competition_id = p_competition and status in ('played', 'walkover');
  select count(*) into removed from public.fixtures where competition_id = p_competition and status in ('scheduled', 'cancelled');
  delete from public.results where fixture_id in
    (select id from public.fixtures where competition_id = p_competition and status in ('scheduled', 'cancelled'));
  delete from public.fixtures where competition_id = p_competition and status in ('scheduled', 'cancelled');
  if kept = 0 then
    perform public.generate_fixtures(p_competition);
    select count(*) into made from public.fixtures where competition_id = p_competition;
    return jsonb_build_object('kept', 0, 'removed', removed, 'created', made);
  end if;
  for r in
    select a.id as a, b.id as b from public.teams a join public.teams b on a.id < b.id
    where a.competition_id = p_competition and b.competition_id = p_competition and a.status = 'active' and b.status = 'active'
      and not exists (select 1 from public.fixtures f where f.competition_id = p_competition and f.team_a = a.id and f.team_b = b.id)
    order by a.id, b.id
  loop
    rnd := 1;
    while exists (select 1 from public.fixtures f where f.competition_id = p_competition and f.round = rnd
                  and (f.team_a in (r.a, r.b) or f.team_b in (r.a, r.b))) loop rnd := rnd + 1; end loop;
    insert into public.fixtures (competition_id, round, team_a, team_b) values (p_competition, rnd, r.a, r.b);
    made := made + 1;
  end loop;
  perform public.add_feed(p_competition, 'fixtures_regenerated', jsonb_build_object('kept', kept, 'removed', removed, 'created', made));
  return jsonb_build_object('kept', kept, 'removed', removed, 'created', made);
end $$;

-- ───────────────────────── Americano (individual, separate from tribal points) ─────────────────────────
create table public.americano_events (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  kind text not null check (kind in ('opening', 'finale')),
  name text not null check (length(trim(name)) > 0),
  points_per_match int not null default 24 check (points_per_match between 4 and 100),
  status text not null default 'draft' check (status in ('draft', 'live', 'completed')),
  created_at timestamptz not null default now(),
  unique (competition_id, kind)
);
create table public.americano_matches (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.americano_events(id) on delete cascade,
  competition_id uuid not null references public.competitions(id) on delete cascade,
  round int not null check (round > 0),
  court int not null check (court > 0),
  a1 uuid not null references public.registrations(id), a2 uuid not null references public.registrations(id),
  b1 uuid not null references public.registrations(id), b2 uuid not null references public.registrations(id),
  score_a int check (score_a >= 0), score_b int check (score_b >= 0),
  status text not null default 'scheduled' check (status in ('scheduled', 'played')),
  scored_by uuid references auth.users(id), scored_at timestamptz,
  unique (event_id, round, court),
  check (a1 <> a2 and a1 <> b1 and a1 <> b2 and a2 <> b1 and a2 <> b2 and b1 <> b2),
  check ((score_a is null) = (score_b is null)),
  check ((status = 'played') = (score_a is not null))
);
create index americano_matches_event_idx on public.americano_matches (event_id, round);

create function public.trg_americano_match() returns trigger
language plpgsql security definer set search_path = '' as $$
declare e public.americano_events;
begin
  select * into e from public.americano_events where id = new.event_id;
  new.competition_id := e.competition_id;
  if exists (select 1 from public.americano_matches m where m.event_id = new.event_id and m.round = new.round and m.id <> new.id
             and (new.a1 in (m.a1, m.a2, m.b1, m.b2) or new.a2 in (m.a1, m.a2, m.b1, m.b2) or new.b1 in (m.a1, m.a2, m.b1, m.b2) or new.b2 in (m.a1, m.a2, m.b1, m.b2))) then
    raise exception 'A player cannot be on two courts in the same round' using errcode = '23514';
  end if;
  if new.score_a is not null and new.score_a + new.score_b <> e.points_per_match then
    raise exception 'The two scores must add up to %', e.points_per_match using errcode = '23514';
  end if;
  return new;
end $$;
create trigger americano_match_guard before insert or update on public.americano_matches
  for each row execute function public.trg_americano_match();

create function public.americano_visible(p_event uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.americano_events e where e.id = p_event
                 and (public.is_comp_admin(e.competition_id) or (public.is_comp_member(e.competition_id) and e.status <> 'draft'))) $$;
revoke all on function public.americano_visible(uuid) from public, anon;
grant execute on function public.americano_visible(uuid) to authenticated;

alter table public.americano_events enable row level security;
alter table public.americano_matches enable row level security;
create policy americano_events_select on public.americano_events for select to authenticated using (public.americano_visible(id));
create policy americano_matches_select on public.americano_matches for select to authenticated using (public.americano_visible(event_id));
grant select on public.americano_events, public.americano_matches to authenticated;

create function public.create_americano(p_competition uuid, p_kind text, p_name text, p_points int, p_rounds jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare eid uuid; rd jsonb; mt jsonb; ri int := 0; ci int; ids uuid[];
begin
  if not public.is_comp_admin(p_competition) then raise exception 'Only an administrator can create an Americano' using errcode = '42501'; end if;
  if p_kind not in ('opening', 'finale') then raise exception 'Kind must be opening or finale' using errcode = '22023'; end if;
  if p_rounds is null or jsonb_typeof(p_rounds) <> 'array' or jsonb_array_length(p_rounds) = 0 then raise exception 'The schedule has no rounds' using errcode = '22023'; end if;
  if exists (select 1 from public.americano_matches m join public.americano_events e on e.id = m.event_id
             where e.competition_id = p_competition and e.kind = p_kind and m.status = 'played') then
    raise exception 'This Americano already has scores, so it cannot be replaced' using errcode = '23514';
  end if;
  delete from public.americano_events where competition_id = p_competition and kind = p_kind;
  insert into public.americano_events (competition_id, kind, name, points_per_match) values (p_competition, p_kind, p_name, p_points) returning id into eid;
  for rd in select * from jsonb_array_elements(p_rounds) loop
    ri := ri + 1; ci := 0;
    for mt in select * from jsonb_array_elements(rd) loop
      ci := ci + 1;
      select array_agg(x::uuid) into ids from jsonb_array_elements_text(mt) x;
      if array_length(ids, 1) <> 4 then raise exception 'Every match needs exactly 4 players' using errcode = '22023'; end if;
      if (select count(*) from public.registrations where id = any (ids) and competition_id = p_competition and status = 'approved') <> 4 then
        raise exception 'Every player must be an approved player of this competition' using errcode = '22023';
      end if;
      insert into public.americano_matches (event_id, competition_id, round, court, a1, a2, b1, b2) values (eid, p_competition, ri, ci, ids[1], ids[2], ids[3], ids[4]);
    end loop;
  end loop;
  return eid;
end $$;

create function public.score_americano_match(p_match uuid, p_a int, p_b int) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.americano_matches; e public.americano_events;
begin
  select * into m from public.americano_matches where id = p_match;
  if not found then raise exception 'Match not found' using errcode = 'P0002'; end if;
  select * into e from public.americano_events where id = m.event_id;
  if not public.is_comp_admin(e.competition_id) then raise exception 'Only an administrator can enter Americano scores' using errcode = '42501'; end if;
  if e.status <> 'live' then raise exception 'The Americano must be live to enter scores' using errcode = '23514'; end if;
  if p_a is null or p_b is null or p_a < 0 or p_b < 0 then raise exception 'Enter both scores as whole numbers' using errcode = '22023'; end if;
  if p_a + p_b <> e.points_per_match then raise exception 'The two scores must add up to %', e.points_per_match using errcode = '22023'; end if;
  update public.americano_matches set score_a = p_a, score_b = p_b, status = 'played', scored_by = auth.uid(), scored_at = now() where id = p_match;
end $$;

create function public.set_americano_status(p_event uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare e public.americano_events; winner text; unplayed int;
begin
  select * into e from public.americano_events where id = p_event;
  if not found then raise exception 'Americano not found' using errcode = 'P0002'; end if;
  if not public.is_comp_admin(e.competition_id) then raise exception 'Only an administrator can change an Americano' using errcode = '42501'; end if;
  if p_status not in ('draft', 'live', 'completed') then raise exception 'Unknown status' using errcode = '22023'; end if;
  if p_status = 'draft' and exists (select 1 from public.americano_matches where event_id = p_event and status = 'played') then
    raise exception 'It has scores, so it cannot go back to draft' using errcode = '23514';
  end if;
  if p_status = 'completed' then
    select count(*) into unplayed from public.americano_matches where event_id = p_event and status <> 'played';
    if unplayed > 0 then raise exception '% matches still have no score', unplayed using errcode = '23514'; end if;
  end if;
  update public.americano_events set status = p_status where id = p_event;
  if p_status = 'completed' and e.status <> 'completed' then
    select s.name into winner from public.americano_standings s where s.event_id = p_event order by s.rank, s.name limit 1;
    perform public.add_feed(e.competition_id, 'americano_completed', jsonb_build_object('kind', e.kind, 'name', e.name, 'winner', winner));
  end if;
end $$;

create function public.delete_americano(p_event uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare e public.americano_events;
begin
  select * into e from public.americano_events where id = p_event;
  if not found then return; end if;
  if not public.is_comp_admin(e.competition_id) then raise exception 'Only an administrator can delete an Americano' using errcode = '42501'; end if;
  if exists (select 1 from public.americano_matches where event_id = p_event and status = 'played') then
    raise exception 'It has scores, so it cannot be deleted' using errcode = '23514';
  end if;
  delete from public.americano_events where id = p_event;
end $$;

-- Individual standings. Never touches tribal points. Tribe is shown only once that tribe is revealed.
create view public.americano_standings as
with slots as (
  select event_id, a1 as reg, score_a as pf, score_b as pa, status from public.americano_matches
  union all select event_id, a2, score_a, score_b, status from public.americano_matches
  union all select event_id, b1, score_b, score_a, status from public.americano_matches
  union all select event_id, b2, score_b, score_a, status from public.americano_matches
), agg as (
  select event_id, reg,
    count(*) filter (where status = 'played') as played,
    count(*) filter (where status = 'played' and pf > pa) as wins,
    coalesce(sum(pf) filter (where status = 'played'), 0) as pts_for,
    coalesce(sum(pa) filter (where status = 'played'), 0) as pts_against
  from slots group by event_id, reg
)
select e.competition_id, a.event_id, e.kind, a.reg as registration_id,
  coalesce(r.placeholder_name, p.display_name, p.full_name, 'Player') as name,
  (select tm.team_id from public.team_members tm join public.teams t on t.id = tm.team_id
     where tm.registration_id = a.reg and tm.left_at is null and (t.revealed or public.is_comp_admin(t.competition_id)) limit 1) as team_id,
  a.played::int as played, a.wins::int as wins, a.pts_for::int as pts_for, a.pts_against::int as pts_against,
  (a.pts_for - a.pts_against)::int as diff,
  (rank() over (partition by a.event_id order by a.pts_for desc, (a.pts_for - a.pts_against) desc, a.wins desc))::int as rank
from agg a
join public.americano_events e on e.id = a.event_id
join public.registrations r on r.id = a.reg
left join public.profiles p on p.id = r.user_id
where public.is_comp_admin(e.competition_id) or (public.is_comp_member(e.competition_id) and e.status <> 'draft');
grant select on public.americano_standings to authenticated;

-- ───────────────────────── Grants, realtime ─────────────────────────
revoke all on function public.assign_tribes(uuid, jsonb, boolean, boolean), public.randomize_captains(uuid),
  public.set_lineup(uuid, uuid, uuid, uuid), public.lock_lineups(uuid, boolean), public.regenerate_fixtures(uuid, boolean),
  public.create_americano(uuid, text, text, int, jsonb), public.score_americano_match(uuid, int, int),
  public.set_americano_status(uuid, text), public.delete_americano(uuid) from public, anon;
grant execute on function public.assign_tribes(uuid, jsonb, boolean, boolean), public.randomize_captains(uuid),
  public.set_lineup(uuid, uuid, uuid, uuid), public.lock_lineups(uuid, boolean), public.regenerate_fixtures(uuid, boolean),
  public.create_americano(uuid, text, text, int, jsonb), public.score_americano_match(uuid, int, int),
  public.set_americano_status(uuid, text), public.delete_americano(uuid) to authenticated;
revoke all on function public.trg_team_reveal(), public.trg_team_reveal_feed(), public.trg_americano_match() from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.lineups, public.americano_events, public.americano_matches;
  end if;
end $$;
