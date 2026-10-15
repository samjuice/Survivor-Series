-- Run with: psql -d <db> -v ON_ERROR_STOP=1 -f supabase/tests/10_rls_and_rules.sql
-- Every check logs PASS/FAIL into t.log; the script prints a summary and exits non-zero on any FAIL.
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

-- ids
\set owner  '00000000-0000-0000-0000-0000000000a1'
\set admin  '00000000-0000-0000-0000-0000000000a2'
\set p1     '00000000-0000-0000-0000-0000000000b1'
\set c1 '00000000-0000-0000-0000-0000000000c1'
\set c2 '00000000-0000-0000-0000-0000000000c2'
\set c3 '00000000-0000-0000-0000-0000000000c3'
\set c4 '00000000-0000-0000-0000-0000000000c4'
\set c5 '00000000-0000-0000-0000-0000000000c5'
\set d1 '00000000-0000-0000-0000-0000000000d1'
\set e1 '00000000-0000-0000-0000-0000000000e1'

-- seed identities (as superuser, like the Supabase auth service would)
insert into auth.users (id, email)
select u::uuid, 'u' || right(u, 2) || '@example.test'
from unnest(array[:'owner', :'admin', :'p1', :'c1', :'c2', :'c3', :'c4', :'c5', :'d1', :'e1']) u;
insert into public.profiles (id, full_name, status)
select id, 'Person ' || right(id::text, 2), case when id = :'e1'::uuid then 'suspended' else 'active' end from auth.users;
insert into public.platform_owners (user_id) values (:'owner');

-- ═══ Platform owner / roles ═══
select t.login(:'p1');
select t.fails($$insert into public.competitions (name, slug, phase, capacity) values ('Hack','hack','registration',5)$$, 'player cannot create a competition');
select t.fails($$insert into public.platform_owners (user_id) values ('00000000-0000-0000-0000-0000000000b1')$$, 'player cannot make themselves platform owner');
select t.fails($$select * from public.platform_owners$$, 'player cannot read platform_owners');

select t.login(:'owner');
select t.ok($$insert into public.competitions (name, slug, phase, capacity, entry_fee_cents, admin_fee_cents, team_size)
  values ('November 2026 Survivor Padel Series','nov-2026','registration',7,50000,10000,2)$$, 'platform owner can create a competition');
select t.root();
select id as comp from public.competitions where slug = 'nov-2026' \gset
select t.login(:'p1');
select t.fails(format($$insert into public.competition_admins values (%L, %L)$$, :'comp', :'p1'), 'player cannot grant themselves admin');
select t.login(:'admin');
select t.fails(format($$insert into public.competition_admins values (%L, %L)$$, :'comp', :'admin'), 'non-owner cannot assign admins');
select t.login(:'owner');
select t.ok(format($$insert into public.competition_admins values (%L, %L)$$, :'comp', :'admin'), 'platform owner can assign a competition admin');

-- ═══ Registration & capacity ═══
select t.anon();
select t.fails($$select * from public.registrations$$, 'anon cannot read registrations');
select t.fails($$select * from public.profiles$$, 'anon cannot read profiles');
select t.fails($$select * from public.teams$$, 'anon cannot read teams');
select t.eq($$select count(*)::text from public.competitions$$, '1', 'anon can see the public competition');

select t.login(:'c1');
select t.fails(format($$insert into public.registrations (competition_id, user_id, status) values (%L, %L, 'approved')$$, :'comp', :'c1'), 'player cannot self-approve at sign-up');
select t.fails(format($$insert into public.registrations (competition_id, user_id, payment_status) values (%L, %L, 'paid')$$, :'comp', :'c1'), 'player cannot mark themselves paid at sign-up');
select t.fails(format($$insert into public.registrations (competition_id, user_id) values (%L, %L)$$, :'comp', :'p1'), 'player cannot register someone else');
select t.ok(format($$insert into public.registrations (competition_id, user_id) values (%L, %L)$$, :'comp', :'c1'), 'player can register themselves');
select t.fails(format($$update public.registrations set status = 'approved' where user_id = %L$$, :'c1'), 'player cannot approve own registration');
select t.fails(format($$update public.registrations set payment_status = 'paid' where user_id = %L$$, :'c1'), 'player cannot confirm own payment');
select t.login(:'e1');
select t.fails(format($$insert into public.registrations (competition_id, user_id) values (%L, %L)$$, :'comp', :'e1'), 'suspended user cannot register');

-- everyone else registers
select t.login(:'c2'); select t.ok(format($$insert into public.registrations (competition_id, user_id) values (%L, %L)$$, :'comp', :'c2'), 'c2 registers');
select t.login(:'c3'); select t.ok(format($$insert into public.registrations (competition_id, user_id) values (%L, %L)$$, :'comp', :'c3'), 'c3 registers');
select t.login(:'c4'); select t.ok(format($$insert into public.registrations (competition_id, user_id) values (%L, %L)$$, :'comp', :'c4'), 'c4 registers');
select t.login(:'c5'); select t.ok(format($$insert into public.registrations (competition_id, user_id) values (%L, %L)$$, :'comp', :'c5'), 'c5 registers');
select t.login(:'p1'); select t.ok(format($$insert into public.registrations (competition_id, user_id) values (%L, %L)$$, :'comp', :'p1'), 'p1 registers');
select t.login(:'d1'); select t.ok(format($$insert into public.registrations (competition_id, user_id) values (%L, %L)$$, :'comp', :'d1'), 'd1 registers');
select t.eq($$select count(*)::text from public.registrations$$, '1', 'a player sees only their own registration');
select t.ok(format($$update public.registrations set status = 'withdrawn' where user_id = %L$$, :'d1'), 'player can withdraw a pending registration');

select t.login(:'admin');
select t.eq($$select count(*)::text from public.registrations$$, '7', 'admin sees all registrations');
select t.ok($$update public.registrations set status = 'approved', payment_status = 'paid' where user_id in
  ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000c3',
   '00000000-0000-0000-0000-0000000000c4','00000000-0000-0000-0000-0000000000c5')$$, 'admin approves and confirms payment');
select t.eq($$select count(*)::text from public.registrations where payment_status = 'paid' and paid_at is not null$$, '5', 'paid_at is stamped automatically');
select t.ok(format($$insert into public.registrations (competition_id, placeholder_name, status, payment_status) values (%L, 'Pete Placeholder', 'approved', 'paid')$$, :'comp'), 'admin can add a paid placeholder');
select t.ok($$update public.registrations set status = 'approved' where user_id = '00000000-0000-0000-0000-0000000000b1'$$, 'admin approves up to capacity (7)');
select t.fails($$update public.competitions set capacity = 5 where slug = 'nov-2026'$$, 'capacity cannot drop below approved players');
select t.login(:'c1');
select t.fails(format($$update public.registrations set status = 'withdrawn' where user_id = %L$$, :'c1'), 'player cannot withdraw once approved');
select t.root();
update public.registrations set status = 'pending' where user_id = :'d1';   -- reset for the capacity test
select t.login(:'admin');
select t.fails($$update public.registrations set status = 'approved' where user_id = '00000000-0000-0000-0000-0000000000d1'$$, 'approving beyond capacity is refused');
select t.eq(format($$select public.prize_pool_cents(%L)::text$$, :'comp'), '290000', 'prize pool = paid fees minus admin fee (6 paid x R500 - R100)');
select t.ok($$update public.competitions set prize_pool_override_cents = 123456 where slug = 'nov-2026'$$, 'admin can set an exact prize pool');
select t.eq(format($$select public.prize_pool_cents(%L)::text$$, :'comp'), '123456', 'prize pool override wins');
select t.ok($$update public.competitions set prize_pool_override_cents = null, capacity = 9 where slug = 'nov-2026'$$, 'admin can raise capacity and clear override');
select t.login(:'d1');
select t.eq(format($$select coalesce(public.prize_pool_cents(%L)::text, 'null')$$, :'comp'), 'null', 'non-members cannot read the prize pool');

-- ═══ Teams ═══
select t.login(:'p1');
select t.fails(format($$insert into public.teams (competition_id, name) values (%L, 'Hack')$$, :'comp'), 'player cannot create teams');
select t.login(:'admin');
select t.ok(format($$insert into public.teams (competition_id, name) select %L, 'T' || g from generate_series(1,5) g$$, :'comp'), 'admin creates 5 tribes');
select t.root();
select id as t1 from public.teams where name = 'T1' \gset
select id as t2 from public.teams where name = 'T2' \gset
select id as t3 from public.teams where name = 'T3' \gset
select id as t4 from public.teams where name = 'T4' \gset
select id as t5 from public.teams where name = 'T5' \gset
select id as r_c1 from public.registrations where user_id = :'c1' \gset
select id as r_c2 from public.registrations where user_id = :'c2' \gset
select id as r_c3 from public.registrations where user_id = :'c3' \gset
select id as r_c4 from public.registrations where user_id = :'c4' \gset
select id as r_c5 from public.registrations where user_id = :'c5' \gset
select id as r_p1 from public.registrations where user_id = :'p1' \gset
select id as r_d1 from public.registrations where user_id = :'d1' \gset
select id as r_pete from public.registrations where placeholder_name = 'Pete Placeholder' \gset
select t.login(:'admin');
select t.ok(format($$insert into public.team_members (team_id, registration_id, is_captain) values (%L,%L,true),(%L,%L,true),(%L,%L,true),(%L,%L,true),(%L,%L,true)$$,
  :'t1', :'r_c1', :'t2', :'r_c2', :'t3', :'r_c3', :'t4', :'r_c4', :'t5', :'r_c5'), 'admin assigns captains');
select t.ok(format($$insert into public.team_members (team_id, registration_id) values (%L, %L)$$, :'t1', :'r_pete'), 'placeholder can be placed on a tribe');
select t.fails(format($$insert into public.team_members (team_id, registration_id) values (%L, %L)$$, :'t1', :'r_p1'), 'full tribe refuses another player (size 2)');
select t.fails(format($$insert into public.team_members (team_id, registration_id) values (%L, %L)$$, :'t2', :'r_d1'), 'unapproved player cannot join a tribe');
select t.fails(format($$insert into public.team_members (team_id, registration_id) values (%L, %L)$$, :'t3', :'r_c1'), 'a player cannot be on two tribes');
select t.ok(format($$insert into public.team_members (team_id, registration_id) values (%L, %L)$$, :'t2', :'r_p1'), 'player joins a non-full tribe');
select t.login(:'p1');
select t.fails(format($$insert into public.team_members (team_id, registration_id) values (%L, %L)$$, :'t3', :'r_p1'), 'player cannot assign themselves');
select t.login(:'c3');
select t.eq($$select count(*)::text from public.roster$$, '0', 'roster hidden until tribes are revealed');
select t.login(:'admin');
select t.ok($$update public.teams set revealed = true$$, 'admin reveals tribes');
select t.login(:'c3');
select t.eq($$select count(*)::text from public.roster$$, '7', 'members see rosters after reveal (names only)');
select t.eq($$select count(*)::text from public.team_members$$, '1', 'members can read raw team_members only for their own tribe');
select t.login(:'d1');
select t.eq($$select count(*)::text from public.roster$$, '0', 'non-members never see rosters');

-- ═══ Fixtures ═══
select t.login(:'admin');
select t.ok($$update public.competitions set phase = 'tribal', show_fixtures = true, show_table = true where slug = 'nov-2026'$$, 'admin moves to tribal phase and shows table + fixtures');
select t.login(:'p1');
select t.fails(format($$select public.generate_fixtures(%L)$$, :'comp'), 'player cannot generate fixtures');
select t.fails($$update public.fixtures set status = 'played'$$, 'player cannot edit fixtures');
select t.login(:'admin');
select t.eq(format($$select public.generate_fixtures(%L)::text$$, :'comp'), '10', '5 tribes -> 10 round-robin fixtures');
select t.fails(format($$select public.generate_fixtures(%L)$$, :'comp'), 'fixtures cannot be generated twice');
select t.eq($$select count(*)::text from (select team_id from (select team_a team_id from public.fixtures union all select team_b from public.fixtures) x group by team_id having count(*) = 4) y$$, '5', 'every tribe plays every other once (4 fixtures each)');
select t.eq($$select max(round)::text from public.fixtures$$, '5', 'odd number of tribes -> 5 rounds with byes');

-- ═══ Results ═══
select t.root();
select id as f1, team_a as f1a, team_b as f1b from public.fixtures where team_a in (:'t1', :'t2') and team_b in (:'t1', :'t2') \gset
select id as f2 from public.fixtures where team_a in (:'t2', :'t3') and team_b in (:'t2', :'t3') \gset
select id as f3 from public.fixtures where id not in (:'f1', :'f2') and team_a <> :'t5' and team_b <> :'t5' order by round limit 1 \gset
select id as f4 from public.fixtures where id not in (:'f1', :'f2', :'f3') and team_a <> :'t5' and team_b <> :'t5' order by round limit 1 \gset
select t.login(:'c5');
select t.fails(format($$select public.submit_result(%L, '[[6,0],[6,0],[6,0]]')$$, :'f1'), 'a captain not in the match cannot submit');
select t.login(:'p1');
select t.fails(format($$select public.submit_result(%L, '[[6,0],[6,0],[6,0]]')$$, :'f2'), 'a non-captain cannot submit');
select t.login(:'c1');
select t.fails(format($$select public.submit_result(%L, '[[6,5],[6,0],[6,0]]')$$, :'f1'), 'rule: 6-5 is not a valid set');
select t.fails(format($$select public.submit_result(%L, '[[8,6],[6,0],[6,0]]')$$, :'f1'), 'rule: nothing above 7');
select t.fails(format($$select public.submit_result(%L, '[[6,6],[6,0],[6,0]]')$$, :'f1'), 'rule: no level sets');
select t.fails(format($$select public.submit_result(%L, '[[7,4],[6,0],[6,0]]')$$, :'f1'), 'rule: 7-4 is not valid');
select t.fails(format($$select public.submit_result(%L, '[[6,0],[6,0]]')$$, :'f1'), 'rule: exactly 3 sets (2 refused)');
select t.fails(format($$select public.submit_result(%L, '[[6,0],[6,0],[6,0],[6,0]]')$$, :'f1'), 'rule: exactly 3 sets (4 refused)');
select t.fails(format($$select public.submit_result(%L, '[[6,"x"],[6,0],[6,0]]')$$, :'f1'), 'rule: non-numeric score refused');
select t.login(:'c1');
select t.ok(format($$select public.submit_result(%L, '[[6,0],[6,2],[3,6]]')$$, :'f1'), 'captain submits a valid result (pending)');
select t.eq(format($$select status from public.results where fixture_id = %L$$, :'f1'), 'pending', 'captain result starts pending');
select t.eq(format($$select count(*)::text from public.standings where played > 0$$), '0', 'pending result does not count in standings');
select t.fails(format($$select public.review_result((select id from public.results where fixture_id = %L), true)$$, :'f1'), 'captain cannot approve a result');
select t.fails(format($$update public.results set status = 'approved' where fixture_id = %L$$, :'f1'), 'captain cannot approve by direct update');
select t.fails(format($$insert into public.results (competition_id, fixture_id, winner_team, status) values (%L, %L, %L, 'approved')$$, :'comp', :'f2', :'t2'), 'direct insert into results is refused');
select t.fails($$insert into public.result_sets values (gen_random_uuid(), 1, 6, 0)$$, 'direct insert into result_sets is refused');
select t.login(:'admin');
select t.ok(format($$select public.review_result((select id from public.results where fixture_id = %L), true)$$, :'f1'), 'admin approves the result');
select t.eq(format($$select status from public.fixtures where id = %L$$, :'f1'), 'played', 'approval marks the fixture played');
select t.eq(format($$select points || '|' || set_diff || '|' || game_diff from public.standings where team_id = %L$$, :'f1a'), '3|1|7', 'standings: winner (team_a) 3 pts, set diff +1, game diff +7');
select t.eq(format($$select points || '|' || set_diff || '|' || game_diff from public.standings where team_id = %L$$, :'f1b'), '0|-1|-7', 'standings: loser 0 pts, set diff -1, game diff -7');
select t.eq(format($$select rank::text from public.standings where team_id = %L$$, :'f1a'), '1', 'standings: winner ranked first');
select t.eq(format($$select is_tied::text from public.standings where team_id = %L$$, :'f1a'), 'false', 'standings: leader is not tied');
select t.eq($$select count(*)::text from public.standings where played = 0 and is_tied$$, '3', 'standings: remaining tie is shown explicitly');
select t.login(:'c1');
select t.fails(format($$select public.submit_result(%L, '[[6,0],[6,0],[6,0]]')$$, :'f1'), 'an approved result cannot be resubmitted');

-- rejection flow
select t.login(:'c2');
select t.ok(format($$select public.submit_result(%L, '[[6,1],[6,1],[6,1]]')$$, :'f2'), 'c2 submits for f2');
select t.login(:'admin');
select t.ok(format($$select public.review_result((select id from public.results where fixture_id = %L), false, 'Wrong score')$$, :'f2'), 'admin rejects with a reason');
select t.eq(format($$select count(*)::text from public.standings where played > 0$$), '2', 'rejected result does not count');
select t.login(:'c2');
select t.ok(format($$select public.submit_result(%L, '[[6,2],[6,3],[6,4]]')$$, :'f2'), 'captain can resubmit after a rejection');
select t.login(:'admin');
select t.ok(format($$select public.review_result((select id from public.results where fixture_id = %L), false, 'Still wrong')$$, :'f2'), 'admin rejects again');
select t.ok(format($$delete from public.results where fixture_id = %L and status = 'rejected'$$, :'f2'), 'admin can delete a rejected result');
select t.root();
select t.eq(format($$select count(*)::text from public.result_sets where result_id not in (select id from public.results)$$), '0', 'deleting a result removes its sets');
select t.login(:'admin');

-- walkover
select t.login(:'p1');
select t.fails(format($$select public.record_walkover(%L, %L)$$, :'f3', :'t3'), 'player cannot record a walkover');
select t.login(:'admin');
select t.root();
select team_a as f3a, team_b as f3b from public.fixtures where id = :'f3' \gset
select t.login(:'admin');
select t.ok(format($$select public.record_walkover(%L, %L)$$, :'f3', :'f3b'), 'admin records a walkover');
select t.eq(format($$select string_agg(a_games || '-' || b_games, ',' order by set_no) from public.result_sets where result_id = (select id from public.results where fixture_id = %L)$$, :'f3'), '0-6,0-6,0-6', 'walkover stored as 6-0 6-0 6-0 for the opponent');
select t.eq(format($$select walkover::text || '/' || status from public.results where fixture_id = %L$$, :'f3'), 'true/approved', 'walkover is labelled and approved');
select t.eq(format($$select status from public.fixtures where id = %L$$, :'f3'), 'walkover', 'fixture shows Walkover');

-- admin-entered result with the edge-case valid sets
select t.ok(format($$select public.submit_result(%L, '[[7,5],[7,6],[6,4]]')$$, :'f4'), 'rule: 7-5, 7-6 and 6-4 are valid sets');
select t.eq(format($$select r.status || ' ' || string_agg(s.a_games || '-' || s.b_games, ',' order by s.set_no) from public.results r join public.result_sets s on s.result_id = r.id where r.fixture_id = %L group by r.status$$, :'f4'), 'approved 7-5,7-6,6-4', 'admin-entered result is approved immediately');

-- withdraw a team
select t.fails(format($$select public.withdraw_team(%L, false)$$, :'t5'), 'withdrawing needs explicit confirmation');
select t.root();
select count(*)::text as unplayed_t5 from public.fixtures where status = 'scheduled' and (team_a = :'t5' or team_b = :'t5') \gset
select t.login(:'admin');
select t.eq(format($$select public.withdraw_team(%L, true)::text$$, :'t5'), :'unplayed_t5', 'withdrawing converts every unplayed fixture in one action');
select t.eq(format($$select count(*)::text from public.fixtures where status = 'scheduled' and (team_a = %L or team_b = %L)$$, :'t5', :'t5'), '0', 'no unplayed fixtures remain for the withdrawn team');
select t.eq(format($$select status from public.teams where id = %L$$, :'t5'), 'withdrawn', 'team is marked withdrawn');
select t.login(:'p1');
select t.fails(format($$select public.withdraw_team(%L, true)$$, :'t4'), 'player cannot withdraw a team');

-- replace player keeps history
select t.login(:'admin');
select t.ok(format($$insert into public.registrations (competition_id, placeholder_name, status, payment_status) values (%L, 'Rita Replacement', 'approved', 'paid')$$, :'comp'), 'admin adds a replacement');
select t.root();
select id as r_rita from public.registrations where placeholder_name = 'Rita Replacement' \gset
select t.login(:'admin');
select t.ok(format($$select public.replace_team_player(%L, %L, %L)$$, :'t1', :'r_pete', :'r_rita'), 'admin replaces a player');
select t.eq(format($$select count(*)::text from public.team_members where team_id = %L$$, :'t1'), '3', 'history kept: old membership row still exists');
select t.eq(format($$select count(*)::text from public.team_members where team_id = %L and left_at is null$$, :'t1'), '2', 'only two active members after replacement');

-- ═══ Tampering through the API ═══
select t.login(:'p1');
select t.fails($$insert into public.feed_events (competition_id, kind) select id, 'fake' from public.competitions$$, 'player cannot write feed events');
select t.fails($$select public.add_feed(gen_random_uuid(), 'x', '{}')$$, 'player cannot call add_feed');
select t.fails($$select public._make_walkover(gen_random_uuid(), gen_random_uuid(), gen_random_uuid())$$, 'player cannot call internal walkover function');
select t.ok($$update public.competitions set capacity = 1$$, 'player update of competitions is silently filtered by RLS');
select t.fails($$update public.profiles set status = 'active' where id <> '00000000-0000-0000-0000-0000000000b1'$$, 'player cannot change profile status (no column grant)');
select t.ok($$delete from public.teams$$, 'player delete of teams is silently filtered by RLS');
select t.eq($$select count(*)::text from public.announcements$$, '0', 'no announcements yet');
select t.fails(format($$insert into public.announcements (competition_id, title) values (%L, 'Hack')$$, :'comp'), 'player cannot post announcements');
select t.login(:'admin');
select t.ok(format($$insert into public.announcements (competition_id, title, body, pinned) values (%L, 'Welcome', 'Good luck', true)$$, :'comp'), 'admin posts a pinned announcement');
select t.login(:'p1');
select t.eq($$select count(*)::text from public.announcements$$, '1', 'members can read announcements');
select t.root();
select t.eq($$select capacity::text from public.competitions where slug = 'nov-2026'$$, '9', 'competition capacity unchanged by player attempt');
select t.eq($$select count(*)::text from public.teams$$, '5', 'teams untouched by player delete attempt');

-- ═══ Feed content ═══
select t.login(:'c1');
select t.eq($$select string_agg(distinct kind, ',' order by kind) from public.feed_events$$, 'announcement,fixtures_generated,player_joined,result_approved,team_withdrawn', 'feed has the expected event kinds');
select t.root();
select t.eq($$select count(*)::text from public.feed_events where payload::text ~* '(paid|payment|fee|amount|eft)'$$, '0', 'feed never exposes payment details');
select t.eq($$select count(*)::text from public.feed_events where kind = 'player_joined'$$, '8', 'a player_joined event per approved player/placeholder');

-- ═══ Database-level guards (even for trusted roles) ═══
select t.fails($$insert into public.result_sets values ((select id from public.results limit 1), 1, 6, 5)$$, 'db check: 6-5 rejected');
select t.fails($$insert into public.result_sets values ((select id from public.results limit 1), 2, 8, 6)$$, 'db check: 8-6 rejected');
select t.fails($$insert into public.result_sets values ((select id from public.results limit 1), 3, 5, 5)$$, 'db check: level set rejected');
select t.fails($$insert into public.result_sets values ((select id from public.results limit 1), 3, 7, 4)$$, 'db check: 7-4 rejected');
create function t.two_set_result() returns void language plpgsql as $$
declare fx uuid; rid uuid; ta uuid;
begin
  select id, team_a into fx, ta from public.fixtures where status = 'scheduled' limit 1;
  insert into public.results (competition_id, fixture_id, winner_team) select competition_id, id, team_a from public.fixtures where id = fx returning id into rid;
  insert into public.result_sets values (rid, 1, 6, 0), (rid, 2, 6, 0);
  set constraints all immediate;
end $$;
select t.fails($$select t.two_set_result()$$, 'db guard: a 2-set result cannot be committed');

-- ═══ Structure checks ═══
select t.eq($$select count(*)::text from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity$$, '0', 'RLS is enabled on every public table');
select t.eq($$select string_agg(table_name || ':' || privilege_type, ',' order by table_name) from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public'$$, 'competitions:SELECT', 'anon holds only SELECT on competitions');
select t.eq($$select count(*)::text from information_schema.role_table_grants where grantee in ('anon','authenticated') and table_schema = 'public' and privilege_type in ('TRUNCATE','REFERENCES','TRIGGER')$$, '0', 'API roles hold no TRUNCATE/REFERENCES/TRIGGER');
select t.eq($$select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')$$, '0', 'anon can execute no public function');
select t.eq($$select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and (p.proname like 'trg\_%' or p.proname in ('add_feed','_make_walkover','is_valid_set')) and has_function_privilege('authenticated', p.oid, 'execute')$$, '0', 'internal/trigger functions are not callable by signed-in users');
select t.eq($$select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('submit_result','review_result','record_walkover','withdraw_team','generate_fixtures','replace_team_player','prize_pool_cents') and has_function_privilege('authenticated', p.oid, 'execute')$$, '7', 'signed-in users can call the 7 intended RPCs');
select t.eq($$select count(*)::text from information_schema.role_table_grants where grantee = 'authenticated' and table_name = 'platform_owners'$$, '0', 'authenticated has no grants on platform_owners');
select t.eq($$select count(*)::text from pg_publication_tables where pubname = 'supabase_realtime'$$, '7', 'seven tables are in the realtime publication');

\o
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from t.log;
