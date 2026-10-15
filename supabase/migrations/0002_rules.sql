-- 0002_rules: business rules enforced in the database (not just the forms).

-- ───────────────────────── Feed helper (server-side only) ─────────────────────────
create function public.add_feed(p_competition uuid, p_kind text, p_payload jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into public.feed_events (competition_id, kind, payload) values (p_competition, p_kind, coalesce(p_payload, '{}'::jsonb)) $$;
revoke all on function public.add_feed(uuid, text, jsonb) from public, anon, authenticated;

-- ───────────────────────── Score rules ─────────────────────────
create function public.is_valid_set(a int, b int) returns boolean
language sql immutable as $$
  select (a = 6 and b between 0 and 4) or (b = 6 and a between 0 and 4)
      or (a = 7 and b in (5, 6))        or (b = 7 and a in (5, 6)) $$;

-- Final guard on the data itself: a result always has exactly 3 sets and a winner that matches them.
-- Deferred so the sets can be inserted after the result row, checked at commit.
create function public.trg_check_result() returns trigger language plpgsql as $$
declare rid uuid; r public.results; f public.fixtures; n int; aw int; bw int; expected uuid;
begin
  if tg_table_name = 'results' then
    rid := new.id;
  elsif tg_op = 'DELETE' then
    rid := old.result_id;
  else
    rid := new.result_id;
  end if;
  select * into r from public.results where id = rid;
  if not found then return null; end if;                    -- result was deleted (cascade)
  select * into f from public.fixtures where id = r.fixture_id;
  select count(*), count(*) filter (where a_games > b_games), count(*) filter (where b_games > a_games)
    into n, aw, bw from public.result_sets where result_id = rid;
  if n <> 3 then
    raise exception 'A match is exactly 3 sets (found %).', n using errcode = '23514';
  end if;
  expected := case when aw > bw then f.team_a else f.team_b end;
  if r.winner_team <> expected then
    raise exception 'The recorded winner does not match the set scores.' using errcode = '23514';
  end if;
  return null;
end $$;

create constraint trigger result_sets_check after insert or update or delete on public.result_sets
  deferrable initially deferred for each row execute function public.trg_check_result();
create constraint trigger results_check after insert or update of winner_team on public.results
  deferrable initially deferred for each row execute function public.trg_check_result();

-- ───────────────────────── Registrations ─────────────────────────
create function public.trg_registration_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.payment_status is distinct from old.payment_status then
    new.paid_at := case when new.payment_status = 'paid' then now() else null end;
  end if;
  -- Trusted server contexts have no JWT subject; signed-in users do.
  if auth.uid() is not null and not public.is_comp_admin(old.competition_id) then
    if old.user_id is distinct from auth.uid() then
      raise exception 'Not allowed' using errcode = '42501';
    end if;
    if new.user_id is distinct from old.user_id
       or new.placeholder_name is distinct from old.placeholder_name
       or new.payment_status is distinct from old.payment_status then
      raise exception 'Only an administrator can change payment or player details' using errcode = '42501';
    end if;
    if not (new.status = old.status or (new.status = 'withdrawn' and old.status in ('pending', 'waitlisted'))) then
      raise exception 'You can only withdraw a registration that is still pending' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger registration_guard before update on public.registrations
  for each row execute function public.trg_registration_guard();

create function public.trg_registration_capacity() returns trigger
language plpgsql security definer set search_path = '' as $$
declare cap int; n int;
begin
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    select capacity into cap from public.competitions where id = new.competition_id for update;
    select count(*) into n from public.registrations
      where competition_id = new.competition_id and status = 'approved' and id <> new.id;
    if n >= cap then
      raise exception 'This competition is full (capacity %). Raise the capacity or waitlist the player.', cap
        using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
create trigger registration_capacity before insert or update of status on public.registrations
  for each row execute function public.trg_registration_capacity();

create function public.trg_registration_feed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare nm text;
begin
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    select coalesce(new.placeholder_name, p.display_name, p.full_name, 'A new player') into nm
      from (select 1) x left join public.profiles p on p.id = new.user_id;
    perform public.add_feed(new.competition_id, 'player_joined', jsonb_build_object('name', nm));  -- no payment data
  end if;
  return null;
end $$;
create trigger registration_feed after insert or update of status on public.registrations
  for each row execute function public.trg_registration_feed();

-- ───────────────────────── Competition settings guard ─────────────────────────
create function public.trg_competition_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if new.capacity < old.capacity or new.capacity is distinct from old.capacity then
    select count(*) into n from public.registrations where competition_id = new.id and status = 'approved';
    if new.capacity < n then
      raise exception 'Capacity cannot be lower than the % approved players', n using errcode = '23514';
    end if;
  end if;
  if new.points_per_win is distinct from old.points_per_win or new.team_size is distinct from old.team_size then
    if exists (select 1 from public.results where competition_id = new.id and status = 'approved') then
      raise exception 'Changing points or team size would invalidate approved results; this needs an explicit confirmed reset'
        using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
create trigger competition_guard before update on public.competitions
  for each row execute function public.trg_competition_guard();

-- ───────────────────────── Team membership ─────────────────────────
create function public.trg_team_member_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare t public.teams; r public.registrations; size int; n int;
begin
  select * into t from public.teams where id = new.team_id;
  select * into r from public.registrations where id = new.registration_id;
  if r.competition_id <> t.competition_id then
    raise exception 'That player is registered in a different competition' using errcode = '23514';
  end if;
  if r.status <> 'approved' then
    raise exception 'Only approved players can join a team' using errcode = '23514';
  end if;
  if t.status <> 'active' then
    raise exception 'That team has been withdrawn' using errcode = '23514';
  end if;
  select team_size into size from public.competitions where id = t.competition_id;
  select count(*) into n from public.team_members where team_id = new.team_id and left_at is null;
  if n >= size then
    raise exception 'This team is full (% players)', size using errcode = '23514';
  end if;
  return new;
end $$;
create trigger team_member_guard before insert on public.team_members
  for each row execute function public.trg_team_member_guard();

-- ───────────────────────── Feed triggers ─────────────────────────
create function public.trg_result_approved() returns trigger
language plpgsql security definer set search_path = '' as $$
declare f public.fixtures; an text; bn text; wn text; sets jsonb;
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    select * into f from public.fixtures where id = new.fixture_id;
    update public.fixtures set status = case when new.walkover then 'walkover' else 'played' end where id = f.id;
    select name into an from public.teams where id = f.team_a;
    select name into bn from public.teams where id = f.team_b;
    wn := case when new.winner_team = f.team_a then an else bn end;
    select jsonb_agg(jsonb_build_array(a_games, b_games) order by set_no) into sets
      from public.result_sets where result_id = new.id;
    perform public.add_feed(new.competition_id, 'result_approved', jsonb_build_object(
      'fixture_id', f.id, 'team_a', an, 'team_b', bn, 'winner', wn, 'sets', sets, 'walkover', new.walkover));
  end if;
  return null;
end $$;
create trigger result_approved after update of status on public.results
  for each row execute function public.trg_result_approved();

create function public.trg_fixture_scheduled() returns trigger
language plpgsql security definer set search_path = '' as $$
declare an text; bn text;
begin
  if new.scheduled_at is not null and new.scheduled_at is distinct from old.scheduled_at then
    select name into an from public.teams where id = new.team_a;
    select name into bn from public.teams where id = new.team_b;
    perform public.add_feed(new.competition_id, 'fixture_scheduled', jsonb_build_object(
      'fixture_id', new.id, 'team_a', an, 'team_b', bn, 'scheduled_at', new.scheduled_at));
  end if;
  return null;
end $$;
create trigger fixture_scheduled after update of scheduled_at on public.fixtures
  for each row execute function public.trg_fixture_scheduled();

create function public.trg_announcement_feed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.add_feed(new.competition_id, 'announcement',
    jsonb_build_object('announcement_id', new.id, 'title', new.title));
  return null;
end $$;
create trigger announcement_feed after insert on public.announcements
  for each row execute function public.trg_announcement_feed();

-- ───────────────────────── Result workflow (RPCs) ─────────────────────────
create function public.submit_result(p_fixture uuid, p_sets jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  f public.fixtures; c public.competitions; ex public.results;
  is_admin boolean; rid uuid; i int; a int; b int; aw int := 0; bw int := 0; winner uuid;
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  select * into f from public.fixtures where id = p_fixture;
  if not found then raise exception 'Fixture not found' using errcode = 'P0002'; end if;
  select * into c from public.competitions where id = f.competition_id;
  is_admin := public.is_comp_admin(f.competition_id);
  if not is_admin then
    if not public.is_active_user() then raise exception 'Your account is not active' using errcode = '42501'; end if;
    if not (public.is_team_captain(f.team_a) or public.is_team_captain(f.team_b)) then
      raise exception 'Only a captain of one of the two teams, or an admin, can submit a result' using errcode = '42501';
    end if;
    if c.phase not in ('opening', 'tribal', 'finale') then
      raise exception 'Results cannot be submitted in the current phase' using errcode = '42501';
    end if;
  end if;
  if f.status <> 'scheduled' then
    raise exception 'This fixture already has a final result or was cancelled' using errcode = '23514';
  end if;
  if p_sets is null or jsonb_typeof(p_sets) <> 'array' or jsonb_array_length(p_sets) <> 3 then
    raise exception 'A match is exactly 3 sets. Enter all three.' using errcode = '22023';
  end if;
  for i in 0..2 loop
    begin
      a := (p_sets -> i ->> 0)::int;
      b := (p_sets -> i ->> 1)::int;
    exception when others then
      raise exception 'Set %: enter two whole numbers.', i + 1 using errcode = '22023';
    end;
    if a is null or b is null then raise exception 'Set %: enter both scores.', i + 1 using errcode = '22023'; end if;
    if not public.is_valid_set(a, b) then
      raise exception 'Set %: % - % is not a valid set score. A set is won 6-0 to 6-4, 7-5, or 7-6 (tiebreak).', i + 1, a, b
        using errcode = '22023';
    end if;
    if a > b then aw := aw + 1; else bw := bw + 1; end if;
  end loop;
  winner := case when aw > bw then f.team_a else f.team_b end;

  select * into ex from public.results where fixture_id = p_fixture;
  if found then
    if ex.status = 'approved' then raise exception 'This result is already approved' using errcode = '23514'; end if;
    if ex.status = 'pending' and not is_admin and ex.submitted_by is distinct from auth.uid() then
      raise exception 'A result is already awaiting approval for this match' using errcode = '23514';
    end if;
    delete from public.results where id = ex.id;
  end if;

  insert into public.results (competition_id, fixture_id, submitted_by, status, winner_team)
    values (f.competition_id, p_fixture, auth.uid(), 'pending', winner) returning id into rid;
  for i in 0..2 loop
    insert into public.result_sets (result_id, set_no, a_games, b_games)
      values (rid, i + 1, (p_sets -> i ->> 0)::int, (p_sets -> i ->> 1)::int);
  end loop;
  if is_admin then  -- admin-entered results are approved straight away (after the sets exist, so the feed is complete)
    update public.results set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now() where id = rid;
  end if;
  return rid;
end $$;

create function public.review_result(p_result uuid, p_approve boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.results;
begin
  select * into r from public.results where id = p_result;
  if not found then raise exception 'Result not found' using errcode = 'P0002'; end if;
  if not public.is_comp_admin(r.competition_id) then
    raise exception 'Only an administrator can review results' using errcode = '42501';
  end if;
  if r.status <> 'pending' then raise exception 'Only pending results can be reviewed' using errcode = '23514'; end if;
  if p_approve then
    update public.results set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now() where id = p_result;
  else
    update public.results set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(),
      reject_reason = nullif(trim(coalesce(p_reason, '')), '') where id = p_result;
  end if;
end $$;

-- Internal: a walkover is recorded as 6-0, 6-0, 6-0 for the winner.
create function public._make_walkover(p_fixture uuid, p_winner uuid, p_by uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare f public.fixtures; rid uuid; i int; ex public.results;
begin
  select * into f from public.fixtures where id = p_fixture;
  select * into ex from public.results where fixture_id = p_fixture;
  if found then
    if ex.status = 'approved' then raise exception 'This fixture already has an approved result' using errcode = '23514'; end if;
    delete from public.results where id = ex.id;
  end if;
  insert into public.results (competition_id, fixture_id, submitted_by, status, walkover, winner_team)
    values (f.competition_id, p_fixture, p_by, 'pending', true, p_winner) returning id into rid;
  for i in 1..3 loop
    insert into public.result_sets (result_id, set_no, a_games, b_games)
      values (rid, i, case when p_winner = f.team_a then 6 else 0 end, case when p_winner = f.team_a then 0 else 6 end);
  end loop;
  update public.results set status = 'approved', reviewed_by = p_by, reviewed_at = now() where id = rid;
  return rid;
end $$;
revoke all on function public._make_walkover(uuid, uuid, uuid) from public, anon, authenticated;

create function public.record_walkover(p_fixture uuid, p_winner uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare f public.fixtures;
begin
  select * into f from public.fixtures where id = p_fixture;
  if not found then raise exception 'Fixture not found' using errcode = 'P0002'; end if;
  if not public.is_comp_admin(f.competition_id) then
    raise exception 'Only an administrator can record a walkover' using errcode = '42501';
  end if;
  if p_winner not in (f.team_a, f.team_b) then raise exception 'The winner must be one of the two teams' using errcode = '22023'; end if;
  if f.status <> 'scheduled' then raise exception 'This fixture is already settled' using errcode = '23514'; end if;
  return public._make_walkover(p_fixture, p_winner, auth.uid());
end $$;

create function public.withdraw_team(p_team uuid, p_confirm boolean) returns int
language plpgsql security definer set search_path = '' as $$
declare t public.teams; f public.fixtures; opp uuid; opp_status text; n int := 0;
begin
  select * into t from public.teams where id = p_team;
  if not found then raise exception 'Team not found' using errcode = 'P0002'; end if;
  if not public.is_comp_admin(t.competition_id) then
    raise exception 'Only an administrator can withdraw a team' using errcode = '42501';
  end if;
  if p_confirm is not true then
    raise exception 'Confirmation required: withdrawing a team turns all its unplayed fixtures into walkovers for the opponents'
      using errcode = '22023';
  end if;
  for f in select * from public.fixtures
           where competition_id = t.competition_id and status = 'scheduled' and (team_a = p_team or team_b = p_team) loop
    opp := case when f.team_a = p_team then f.team_b else f.team_a end;
    select status into opp_status from public.teams where id = opp;
    if opp_status = 'withdrawn' then
      update public.fixtures set status = 'cancelled' where id = f.id;
    else
      perform public._make_walkover(f.id, opp, auth.uid());
    end if;
    n := n + 1;
  end loop;
  update public.teams set status = 'withdrawn' where id = p_team;
  perform public.add_feed(t.competition_id, 'team_withdrawn', jsonb_build_object('team', t.name, 'fixtures_converted', n));
  return n;
end $$;

-- ───────────────────────── Fixtures: single round robin (circle method) ─────────────────────────
create function public.generate_fixtures(p_competition uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare ids uuid[]; arr uuid[]; n int; m int; r int; i int; a uuid; b uuid; made int := 0;
begin
  if not public.is_comp_admin(p_competition) then
    raise exception 'Only an administrator can generate fixtures' using errcode = '42501';
  end if;
  if exists (select 1 from public.fixtures where competition_id = p_competition and status <> 'cancelled') then
    raise exception 'Fixtures already exist for this competition. Regeneration that keeps approved scores comes in Stage 2.'
      using errcode = '23514';
  end if;
  select array_agg(id order by id) into ids from public.teams where competition_id = p_competition and status = 'active';
  n := coalesce(array_length(ids, 1), 0);
  if n < 2 then raise exception 'At least 2 active teams are needed to generate fixtures' using errcode = '23514'; end if;
  arr := ids;
  if n % 2 = 1 then arr := array_append(arr, null::uuid); end if;   -- bye
  m := array_length(arr, 1);
  for r in 1..(m - 1) loop
    for i in 1..(m / 2) loop
      a := arr[i]; b := arr[m + 1 - i];
      if a is not null and b is not null then
        insert into public.fixtures (competition_id, round, team_a, team_b) values (p_competition, r, least(a, b), greatest(a, b));
        made := made + 1;
      end if;
    end loop;
    arr := array[arr[1]] || arr[m] || arr[2:m - 1];                 -- rotate everyone except the first
  end loop;
  perform public.add_feed(p_competition, 'fixtures_generated', jsonb_build_object('fixtures', made, 'rounds', m - 1));
  return made;
end $$;

-- ───────────────────────── Replace a player, keeping history ─────────────────────────
create function public.replace_team_player(p_team uuid, p_old_registration uuid, p_new_registration uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare t public.teams; old_m public.team_members; new_id uuid;
begin
  select * into t from public.teams where id = p_team;
  if not found then raise exception 'Team not found' using errcode = 'P0002'; end if;
  if not public.is_comp_admin(t.competition_id) then
    raise exception 'Only an administrator can replace a player' using errcode = '42501';
  end if;
  select * into old_m from public.team_members
    where team_id = p_team and registration_id = p_old_registration and left_at is null for update;
  if not found then raise exception 'That player is not currently on this team' using errcode = 'P0002'; end if;
  update public.team_members set left_at = now(), is_captain = false where id = old_m.id;
  insert into public.team_members (team_id, registration_id, is_captain)
    values (p_team, p_new_registration, old_m.is_captain) returning id into new_id;
  return new_id;
end $$;

-- ───────────────────────── Prize pool ─────────────────────────
create function public.prize_pool_cents(p_competition uuid) returns int
language plpgsql stable security definer set search_path = '' as $$
declare c public.competitions; paid int;
begin
  if not (public.is_comp_admin(p_competition) or public.is_comp_member(p_competition)) then return null; end if;
  select * into c from public.competitions where id = p_competition;
  if not found then return null; end if;
  if c.prize_pool_override_cents is not null then return c.prize_pool_override_cents; end if;
  select count(*) into paid from public.registrations
    where competition_id = p_competition and status = 'approved' and payment_status = 'paid';  -- placeholders count
  return greatest(0, (round((paid * c.entry_fee_cents - c.admin_fee_cents) / 100.0) * 100))::int;  -- whole rand
end $$;

-- ───────────────────────── Views ─────────────────────────
-- Standings respect RLS (security_invoker): only approved results, only when the table is visible.
create view public.standings with (security_invoker = on) as
with m as (
  select f.competition_id, f.team_a, f.team_b, r.winner_team,
    (select count(*) filter (where s.a_games > s.b_games) from public.result_sets s where s.result_id = r.id) as a_sets,
    (select count(*) filter (where s.b_games > s.a_games) from public.result_sets s where s.result_id = r.id) as b_sets,
    (select coalesce(sum(s.a_games), 0) from public.result_sets s where s.result_id = r.id) as a_games,
    (select coalesce(sum(s.b_games), 0) from public.result_sets s where s.result_id = r.id) as b_games
  from public.fixtures f join public.results r on r.fixture_id = f.id and r.status = 'approved'
), sides as (
  select competition_id, team_a as team_id, (winner_team = team_a) as won, a_sets as sf, b_sets as sa, a_games as gf, b_games as ga from m
  union all
  select competition_id, team_b, (winner_team = team_b), b_sets, a_sets, b_games, a_games from m
), agg as (
  select t.competition_id, t.id as team_id, t.name, t.status, c.points_per_win,
    count(s.team_id) as played,
    count(*) filter (where s.won) as won,
    count(*) filter (where s.team_id is not null and not s.won) as lost,
    coalesce(sum(s.sf), 0) as sets_for, coalesce(sum(s.sa), 0) as sets_against,
    coalesce(sum(s.gf), 0) as games_for, coalesce(sum(s.ga), 0) as games_against
  from public.teams t
  join public.competitions c on c.id = t.competition_id
  left join sides s on s.team_id = t.id
  group by t.competition_id, t.id, t.name, t.status, c.points_per_win
)
select competition_id, team_id, name, status, played, won, lost,
  won * points_per_win as points,
  sets_for, sets_against, sets_for - sets_against as set_diff,
  games_for, games_against, games_for - games_against as game_diff,
  rank() over (partition by competition_id
               order by won * points_per_win desc, sets_for - sets_against desc, games_for - games_against desc) as rank,
  count(*) over (partition by competition_id, won * points_per_win, sets_for - sets_against, games_for - games_against) > 1 as is_tied
from agg;

-- Rosters expose names only (never payment data). Runs as owner but filters by who is asking.
create view public.roster as
select tm.team_id, t.competition_id, tm.registration_id,
       coalesce(r.placeholder_name, p.display_name, p.full_name, 'Player') as name, tm.is_captain
from public.team_members tm
join public.teams t on t.id = tm.team_id
join public.registrations r on r.id = tm.registration_id
left join public.profiles p on p.id = r.user_id
where tm.left_at is null
  and (public.is_comp_admin(t.competition_id) or (public.is_comp_member(t.competition_id) and t.revealed));

-- ───────────────────────── Grants for RPCs and views ─────────────────────────
grant select on public.standings, public.roster to authenticated;
revoke all on function public.submit_result(uuid, jsonb), public.review_result(uuid, boolean, text),
  public.record_walkover(uuid, uuid), public.withdraw_team(uuid, boolean), public.generate_fixtures(uuid),
  public.replace_team_player(uuid, uuid, uuid), public.prize_pool_cents(uuid) from public, anon;
grant execute on function public.submit_result(uuid, jsonb), public.review_result(uuid, boolean, text),
  public.record_walkover(uuid, uuid), public.withdraw_team(uuid, boolean), public.generate_fixtures(uuid),
  public.replace_team_player(uuid, uuid, uuid), public.prize_pool_cents(uuid) to authenticated;

-- ───────────────────────── Realtime ─────────────────────────
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.feed_events, public.fixtures, public.results,
      public.announcements, public.teams, public.team_members, public.registrations;
  end if;
end $$;
