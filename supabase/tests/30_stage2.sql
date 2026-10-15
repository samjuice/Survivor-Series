-- Stage 2: random tribes, captains, reveal, lineups, appearances, safe regeneration, Americano.
\set QUIET on
\o /dev/null
select t.root();
\set admin '20000000-0000-0000-0000-000000000001'

-- ── setup: its own competition, 12 approved players, 3 empty tribes ──
insert into auth.users (id, email) select t.uid(n), 'p' || n || '@s2.test' from generate_series(1, 16) n;
insert into auth.users (id, email) values (:'admin', 'admin@s2.test');
insert into public.profiles (id, full_name) select t.uid(n), 'Player ' || lpad(n::text, 2, '0') from generate_series(1, 16) n;
insert into public.profiles (id, full_name) values (:'admin', 'Stage Two Admin');
insert into public.competitions (name, slug, phase, capacity, team_size, show_table, show_fixtures)
  values ('Stage 2 Series', 'stage2', 'opening', 12, 4, true, true);
insert into t.ids select 'comp', id from public.competitions where slug = 'stage2';
insert into public.competition_admins (competition_id, user_id) values (t.id('comp'), :'admin');
insert into public.registrations (competition_id, user_id, status, payment_status)
  select t.id('comp'), t.uid(n), 'approved', 'paid' from generate_series(1, 12) n;
insert into t.ids select 'r' || lpad(n::text, 2, '0'), r.id from public.registrations r join generate_series(1, 12) n on r.user_id = t.uid(n) where r.competition_id = t.id('comp');
insert into public.teams (competition_id, name, emblem_key, color) values
  (t.id('comp'), 'Alpha', 'fang', '#3d6b45'), (t.id('comp'), 'Bravo', 'leaf', '#b5703a'), (t.id('comp'), 'Charlie', 'wave', '#4a7f8c');
insert into t.ids select 'tA', id from public.teams where competition_id = t.id('comp') and name = 'Alpha';
insert into t.ids select 'tB', id from public.teams where competition_id = t.id('comp') and name = 'Bravo';
insert into t.ids select 'tC', id from public.teams where competition_id = t.id('comp') and name = 'Charlie';
create function t.reg(n int) returns text language sql stable security definer as $$ select t.id('r' || lpad($1::text, 2, '0'))::text $$;
create function t.assignment(a int[], b int[], c int[]) returns jsonb language sql stable security definer as $$
  select jsonb_build_array(
    jsonb_build_object('team_id', t.id('tA'), 'registrations', (select jsonb_agg(t.reg(x)) from unnest($1) x)),
    jsonb_build_object('team_id', t.id('tB'), 'registrations', (select jsonb_agg(t.reg(x)) from unnest($2) x)),
    jsonb_build_object('team_id', t.id('tC'), 'registrations', (select jsonb_agg(t.reg(x)) from unnest($3) x))) $$;

-- ═══ Random tribe assignment ═══
select t.login(t.uid(1));
select t.fails($$select public.assign_tribes(t.id('comp'), t.assignment('{1,2,3,4}','{5,6,7,8}','{9,10,11,12}'))$$, 'player cannot assign tribes');
select t.login(:'admin');
select t.fails($$select public.assign_tribes(t.id('comp'), t.assignment('{1,2,3,4,5}','{6,7,8}','{9,10,11,12}'))$$, 'a tribe cannot be over-filled (size 4)');
select t.eq($$select count(*)::text from public.team_members$$, '0', 'a refused assignment leaves nothing half-done');
select t.eq($$select public.assign_tribes(t.id('comp'), t.assignment('{1,2,3,4}','{5,6,7,8}','{9,10,11,12}'))::text$$, '12', 'admin assigns 12 players to 3 tribes');
select t.fails($$select public.assign_tribes(t.id('comp'), t.assignment('{1,2,3,4}','{5,6,7,8}','{9,10,11,12}'))$$, 'assigning the same players twice is refused');
select t.fails($$select public.assign_tribes(t.id('comp'), t.assignment('{12,2,3,4}','{5,6,7,8}','{9,10,11,1}'), true, false)$$, 'reshuffling everyone needs explicit confirmation');
select t.eq($$select count(*)::text from public.team_members where left_at is null$$, '12', 'an unconfirmed reshuffle changes nothing');
select t.eq($$select public.assign_tribes(t.id('comp'), t.assignment('{12,2,3,4}','{5,6,7,8}','{9,10,11,1}'), true, true)::text$$, '12', 'confirmed reshuffle reassigns everyone');
select t.eq($$select count(*)::text from public.team_members$$, '24', 'reshuffle keeps history (12 old + 12 new membership rows)');
select t.eq($$select count(*)::text from public.team_members where left_at is null$$, '12', 'only the new 12 are active');
select t.root();
-- put players back in a known layout for the rest of the tests
update public.team_members set left_at = now() where left_at is null;
select t.login(:'admin');
select t.ok($$select public.assign_tribes(t.id('comp'), t.assignment('{1,2,3,4}','{5,6,7,8}','{9,10,11,12}'))$$, 'known layout restored');

-- ═══ Captains ═══
select t.login(t.uid(2));
select t.fails($$select public.randomize_captains(t.id('comp'))$$, 'player cannot pick captains');
select t.login(:'admin');
select t.eq($$select public.randomize_captains(t.id('comp'))::text$$, '3', 'random captain picked for each tribe without one');
select t.eq($$select public.randomize_captains(t.id('comp'))::text$$, '0', 'running it again changes nothing');
select t.eq($$select count(*)::text from (select team_id from public.team_members where is_captain and left_at is null group by team_id having count(*) = 1) x$$, '3', 'every tribe has exactly one captain');
select t.root();
update public.team_members set is_captain = false where left_at is null;
update public.team_members set is_captain = true where registration_id in (t.id('r01'), t.id('r05'), t.id('r09'));

-- ═══ Reveal ═══
select t.login(t.uid(5));
select t.eq($$select count(*)::text from public.teams where competition_id = t.id('comp')$$, '1', 'before the reveal a player sees only their own tribe');
select t.eq($$select count(*)::text from public.roster where competition_id = t.id('comp')$$, '0', 'and no rosters are public yet');
select t.login(:'admin');
select t.ok($$update public.teams set revealed = true where id = t.id('tA')$$, 'admin reveals one tribe');
select t.eq($$select (revealed_at is not null)::text from public.teams where id = t.id('tA')$$, 'true', 'reveal time is stamped (drives the reveal order)');
select t.login(t.uid(5));
select t.eq($$select count(*)::text from public.teams where competition_id = t.id('comp')$$, '2', 'a revealed tribe becomes visible to everyone');
select t.eq($$select count(*)::text from public.roster where team_id = t.id('tA')$$, '4', 'its roster becomes visible too');
select t.eq($$select count(*)::text from public.feed_events where kind = 'tribe_revealed'$$, '1', 'the reveal appears in the feed');
select t.login(:'admin');
select t.ok($$update public.teams set revealed = false where id = t.id('tA')$$, 'admin can hide it again');
select t.eq($$select coalesce(revealed_at::text, 'null') from public.teams where id = t.id('tA')$$, 'null', 'hiding clears the reveal time');
select t.ok($$update public.teams set revealed = true where competition_id = t.id('comp')$$, 'admin reveals all tribes');

-- ═══ Fixtures, then lineups ═══
select t.ok($$select public.generate_fixtures(t.id('comp'))$$, 'fixtures generated for 3 tribes');
select t.eq($$select count(*)::text from public.fixtures where competition_id = t.id('comp')$$, '3', '3 tribes -> 3 fixtures');
select t.login(t.uid(1));  -- captain of Alpha
select t.ok($$select public.set_lineup(t.fx('tA','tB'), t.id('tA'), t.id('r01'), t.id('r02'))$$, 'captain picks two representatives');
select t.ok($$select public.set_lineup(t.fx('tA','tB'), t.id('tA'), t.id('r03'), t.id('r04'))$$, 'captain can change the pick before the match');
select t.fails($$select public.set_lineup(t.fx('tA','tB'), t.id('tA'), t.id('r03'), t.id('r03'))$$, 'two different players are required');
select t.fails($$select public.set_lineup(t.fx('tA','tB'), t.id('tA'), t.id('r03'), t.id('r05'))$$, 'a player from another tribe is refused');
select t.fails($$select public.set_lineup(t.fx('tA','tB'), t.id('tB'), t.id('r05'), t.id('r06'))$$, 'a captain cannot pick for the other tribe');
select t.fails($$select public.set_lineup(t.fx('tB','tC'), t.id('tB'), t.id('r05'), t.id('r06'))$$, 'a captain cannot pick in a match their tribe is not playing');
select t.login(t.uid(2));  -- ordinary Alpha member
select t.fails($$select public.set_lineup(t.fx('tA','tB'), t.id('tA'), t.id('r01'), t.id('r02'))$$, 'a non-captain cannot pick');
select t.eq($$select count(*)::text from public.lineups$$, '1', 'tribe-mates can see their own tribe''s pick');
select t.login(t.uid(5));  -- captain of Bravo (opponent)
select t.eq($$select count(*)::text from public.lineups$$, '0', 'the opponent cannot see the pick before it is locked');
select t.login(:'admin');
select t.ok($$select public.lock_lineups(t.fx('tA','tB'), true)$$, 'admin locks the line-ups');
select t.login(t.uid(1));
select t.fails($$select public.set_lineup(t.fx('tA','tB'), t.id('tA'), t.id('r01'), t.id('r02'))$$, 'a captain cannot change a locked line-up');
select t.login(t.uid(5));
select t.eq($$select count(*)::text from public.lineups$$, '1', 'once locked, the opponent can see it');
select t.login(:'admin');
select t.ok($$select public.set_lineup(t.fx('tA','tB'), t.id('tA'), t.id('r01'), t.id('r02'))$$, 'admin can still change a locked line-up');
select t.ok($$select public.set_lineup(t.fx('tA','tB'), t.id('tB'), t.id('r05'), t.id('r06'))$$, 'admin can set the other side too');
select t.root();
update public.competitions set phase = 'registration' where id = t.id('comp');
select t.login(t.uid(9));
select t.fails($$select public.set_lineup(t.fx('tB','tC'), t.id('tC'), t.id('r09'), t.id('r10'))$$, 'line-ups are closed outside the match phases');
select t.root(); update public.competitions set phase = 'tribal' where id = t.id('comp');

-- play Alpha v Bravo, then check appearances
select t.login(:'admin');
select t.ok($$select public.submit_result(t.fx('tA','tB'), '[[6,0],[6,1],[6,2]]')$$, 'admin enters and approves the result');
select t.login(t.uid(1));
select t.fails($$select public.set_lineup(t.fx('tA','tB'), t.id('tA'), t.id('r01'), t.id('r02'))$$, 'no line-ups after the match is played');
select t.eq($$select count(*)::text from public.player_appearances$$, '4', 'a player sees appearances only for their own tribe');
select t.eq($$select played::text from public.player_appearances where registration_id = t.id('r01')$$, '1', 'a played match counts as an appearance');
select t.eq($$select played::text from public.player_appearances where registration_id = t.id('r03')$$, '0', 'players not picked have no appearance');
select t.login(:'admin');
select t.eq($$select count(*)::text from public.player_appearances$$, '12', 'admin sees appearances for everyone');
select t.login(t.uid(9));
select t.eq($$select count(*)::text from public.lineups where team_id = t.id('tA')$$, '1', 'a settled match''s line-ups become public');

-- ═══ Fixture regeneration never destroys approved scores ═══
select t.root();
update public.competitions set capacity = 16 where id = t.id('comp');
insert into public.registrations (competition_id, user_id, status, payment_status) select t.id('comp'), t.uid(n), 'approved', 'paid' from generate_series(13, 16) n;
insert into t.ids select 'r' || n, r.id from public.registrations r join generate_series(13, 16) n on r.user_id = t.uid(n) where r.competition_id = t.id('comp');
insert into public.teams (competition_id, name, emblem_key, color, revealed) values (t.id('comp'), 'Delta', 'flame', '#8c4a5a', true);
insert into t.ids select 'tD', id from public.teams where competition_id = t.id('comp') and name = 'Delta';
insert into public.team_members (team_id, registration_id, is_captain) select t.id('tD'), t.id('r' || n), n = 13 from generate_series(13, 16) n;
-- a pending result and a time on fixtures that will be rebuilt
select t.login(t.uid(5));
select t.ok($$select public.submit_result(t.fx('tB','tC'), '[[6,4],[6,4],[6,4]]')$$, 'a captain has a pending result on an unplayed match');
select t.login(:'admin');
select t.ok($$update public.fixtures set scheduled_at = now() + interval '2 days' where id = t.fx('tA','tC')$$, 'a time is set on an unplayed match');
select t.root();
select string_agg(a_games || '-' || b_games, ',' order by set_no) as before_sets, count(*) as before_pts from public.result_sets where result_id = (select id from public.results where fixture_id = t.fx('tA','tB')) \gset
select t.login(t.uid(5));
select t.fails($$select public.regenerate_fixtures(t.id('comp'), true)$$, 'player cannot regenerate fixtures');
select t.login(:'admin');
select t.fails($$select public.regenerate_fixtures(t.id('comp'), false)$$, 'regeneration needs explicit confirmation');
select t.eq($$select (r ->> 'kept') || '/' || (r ->> 'removed') || '/' || (r ->> 'created') from (select public.regenerate_fixtures(t.id('comp'), true) r) x$$, '1/2/5', 'kept 1 played match, rebuilt 2, created 5 new pairings');
select t.root();
select t.eq($$select count(*)::text from public.fixtures where competition_id = t.id('comp')$$, '6', '4 tribes -> 6 fixtures in total');
select t.eq(format($$select string_agg(a_games || '-' || b_games, ',' order by set_no) from public.result_sets where result_id = (select id from public.results where fixture_id = t.fx('tA','tB'))$$), :'before_sets', 'the approved score is exactly as it was');
select t.eq($$select status from public.results where fixture_id = t.fx('tA','tB')$$, 'approved', 'the approved result is still approved');
select t.eq($$select count(*)::text from public.results where competition_id = t.id('comp')$$, '1', 'the pending result on a rebuilt match was cleared');
select t.eq($$select count(*)::text from (select f.round, x.team from public.fixtures f cross join lateral (values (f.team_a), (f.team_b)) x(team) where f.competition_id = t.id('comp') group by f.round, x.team having count(*) > 1) d$$, '0', 'no tribe plays twice in the same round');
select t.eq($$select count(*)::text from public.fixtures where competition_id = t.id('comp') and scheduled_at is not null$$, '0', 'times on rebuilt matches are cleared (as the confirmation warns)');
select t.eq($$select (sum(points) || '/' || max(points))::text from public.standings where team_id in (t.id('tA'), t.id('tB'))$$, '3/3', 'standings still show the approved win (3 points to one of the two tribes)');

-- ═══ Americano ═══
select t.root();
update public.competitions set phase = 'opening' where id = t.id('comp');
update public.teams set revealed = false where id <> t.id('tA') and competition_id = t.id('comp');
select sum(points) as tribal_before from public.standings where competition_id = t.id('comp') \gset
create function t.sched(good boolean) returns jsonb language sql stable security definer as $$
  select jsonb_build_array(
    jsonb_build_array(jsonb_build_array(t.reg(1),t.reg(2),t.reg(3),t.reg(4)), jsonb_build_array(t.reg(5),t.reg(6),t.reg(7),t.reg(8)), jsonb_build_array(t.reg(9),t.reg(10),t.reg(11),t.reg(12))),
    jsonb_build_array(jsonb_build_array(t.reg(1),t.reg(6),t.reg(11),t.reg(4)), jsonb_build_array(t.reg(2),t.reg(7),t.reg(12),t.reg(3)), jsonb_build_array(t.reg(5),t.reg(10),t.reg(9),t.reg(8))),
    jsonb_build_array(jsonb_build_array(t.reg(1),t.reg(8),t.reg(10),t.reg(2)), jsonb_build_array(t.reg(3),t.reg(5),t.reg(12),t.reg(6)), jsonb_build_array(t.reg(4),t.reg(9),t.reg(7), case when $1 then t.reg(11) else t.reg(4) end))) $$;
select t.login(t.uid(1));
select t.fails($$select public.create_americano(t.id('comp'), 'opening', 'Opening Americano', 24, t.sched(true))$$, 'player cannot create an Americano');
select t.login(:'admin');
select t.fails($$select public.create_americano(t.id('comp'), 'opening', 'Opening Americano', 24, t.sched(false))$$, 'a match with a repeated player is refused');
select t.fails($$select public.create_americano(t.id('comp'), 'opening', 'Opening', 24, jsonb_build_array(jsonb_build_array(jsonb_build_array(t.reg(1), t.reg(2), t.reg(3)))))$$, 'a match needs exactly 4 players');
select t.fails($$select public.create_americano(t.id('comp'), 'opening', 'Opening', 24, jsonb_build_array(jsonb_build_array(jsonb_build_array(t.reg(1), t.reg(2), t.reg(3), gen_random_uuid()))))$$, 'players must be approved in this competition');
select t.fails($$select public.create_americano(t.id('comp'), 'opening', 'Opening', 24, jsonb_build_array(jsonb_build_array(jsonb_build_array(t.reg(1), t.reg(2), t.reg(3), t.reg(4)), jsonb_build_array(t.reg(4), t.reg(5), t.reg(6), t.reg(7)))))$$, 'a player cannot be on two courts in one round');
select t.ok($$select public.create_americano(t.id('comp'), 'opening', 'Opening Americano', 24, t.sched(true))$$, 'admin creates the opening Americano');
select t.eq($$select count(*)::text from public.americano_matches$$, '9', '3 rounds x 3 courts = 9 matches');
select t.login(t.uid(1));
select t.eq($$select count(*)::text from public.americano_events$$, '0', 'players cannot see a draft Americano');
select t.eq($$select count(*)::text from public.americano_standings$$, '0', 'nor its standings');
select t.login(:'admin');
select t.fails($$select public.score_americano_match((select id from public.americano_matches where round = 1 and court = 1), 14, 10)$$, 'scores cannot be entered while it is a draft');
select t.ok($$select public.set_americano_status((select id from public.americano_events limit 1), 'live')$$, 'admin makes it live');
select t.login(t.uid(1));
select t.eq($$select count(*)::text from public.americano_matches$$, '9', 'players now see the schedule');
select t.eq($$select count(*)::text from public.americano_standings$$, '12', 'and all 12 players in the standings');
select t.fails($$select public.score_americano_match((select id from public.americano_matches where round = 1 and court = 1), 14, 10)$$, 'a player cannot enter Americano scores');
select t.login(:'admin');
select t.fails($$select public.score_americano_match((select id from public.americano_matches where round = 1 and court = 1), 14, 11)$$, 'the two scores must add up to the points per match');
select t.fails($$select public.score_americano_match((select id from public.americano_matches where round = 1 and court = 1), 30, -6)$$, 'negative scores are refused');
select t.ok($$select public.score_americano_match((select id from public.americano_matches where round = 1 and court = 1), 14, 10)$$, 'admin scores a match');
select t.eq($$select pts_for || '/' || wins || '/' || rank from public.americano_standings where registration_id = t.id('r01')$$, '14/1/1', 'standings: winner has 14 points, 1 win, rank 1');
select t.eq($$select pts_for || '/' || wins from public.americano_standings where registration_id = t.id('r03')$$, '10/0', 'standings: loser has 10 points, 0 wins');
select t.ok($$select public.score_americano_match((select id from public.americano_matches where round = 1 and court = 1), 10, 14)$$, 'a score can be corrected');
select t.eq($$select pts_for || '/' || wins from public.americano_standings where registration_id = t.id('r01')$$, '10/0', 'the correction flows into the standings');
select t.fails($$select public.set_americano_status((select id from public.americano_events limit 1), 'completed')$$, 'cannot complete while matches have no score');
select t.fails($$select public.create_americano(t.id('comp'), 'opening', 'Replace', 24, t.sched(true))$$, 'a scored Americano cannot be replaced');
select t.fails($$select public.delete_americano((select id from public.americano_events limit 1))$$, 'a scored Americano cannot be deleted');
select t.ok($$select public.score_americano_match(id, 13, 11) from public.americano_matches where status = 'scheduled'$$, 'admin scores the remaining matches');
select t.ok($$select public.set_americano_status((select id from public.americano_events limit 1), 'completed')$$, 'admin completes it');
select t.eq($$select count(*)::text from public.feed_events where kind = 'americano_completed'$$, '1', 'completion appears in the feed');
select t.fails($$select public.score_americano_match((select id from public.americano_matches limit 1), 13, 11)$$, 'a completed Americano is locked until reopened');
select t.ok($$select public.set_americano_status((select id from public.americano_events limit 1), 'live')$$, 'admin can reopen it');
-- privacy and points
select t.login(t.uid(10));
select t.eq($$select count(*)::text from public.americano_standings where team_id is not null$$, '4', 'tribes show in the Americano table only for revealed tribes');
select t.root();
select t.eq(format($$select (sum(points) = %s)::text from public.standings where competition_id = t.id('comp')$$, :'tribal_before'), 'true', 'the Americano never changes tribal points');
select t.login(:'admin');
select t.ok($$select public.create_americano(t.id('comp'), 'finale', 'Closing Americano', 16, t.sched(true))$$, 'a finale Americano can be created alongside');
select t.ok($$select public.delete_americano((select id from public.americano_events where kind = 'finale'))$$, 'an unscored Americano can be deleted');
select t.root();
\o
