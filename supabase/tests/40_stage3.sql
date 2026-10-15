-- Stage 3: audit log, awards + voting, notification preferences. Continues on the Stage 2 competition.
\set QUIET on
\o /dev/null
\set admin '20000000-0000-0000-0000-000000000001'
\set nov_admin '00000000-0000-0000-0000-0000000000a2'
\set nov_player '00000000-0000-0000-0000-0000000000b1'
\set owner '00000000-0000-0000-0000-0000000000a1'
select t.root();
update public.teams set revealed = true where competition_id = t.id('comp');
update public.competitions set phase = 'finale' where id = t.id('comp');
select coalesce(sum(points), 0) as pts_before from public.standings where competition_id = t.id('comp') \gset
select coalesce(sum(pts_for), 0) as amer_before from public.americano_standings where competition_id = t.id('comp') \gset

-- ═══ Audit log ═══
select t.login(:'admin');
select t.ok($$update public.registrations set payment_status = 'unpaid' where id = t.id('r16')$$, 'admin marks a player unpaid');
select t.eq($$select (details -> 'payment_status' ->> 'from') || '>' || (details -> 'payment_status' ->> 'to') || '/' || actor_name from public.audit_log where entity = 'registrations' and entity_id = t.id('r16')::text and details ? 'payment_status' order by id desc limit 1$$, 'paid>unpaid/Stage Two Admin', 'the change is logged with who, what and before/after');
select t.ok($$insert into public.payment_info (competition_id, instructions) values (t.id('comp'), 'IBAN 12345 secret bank details')$$, 'admin saves bank details');
select t.eq($$select count(*)::text from public.audit_log where entity = 'payment_info'$$, '1', 'saving payment instructions is logged');
select t.eq($$select count(*)::text from public.audit_log where details::text ~* '(IBAN|secret bank|12345)'$$, '0', 'but the bank details themselves are never written to the log');
select t.ok($$select public.set_user_status(t.uid(16), 'suspended')$$, 'admin suspends a player');
select t.eq($$select details -> 'status' ->> 'to' from public.audit_log where entity = 'profiles' and entity_id = t.uid(16)::text$$, 'suspended', 'suspensions are logged');
select t.ok($$select public.set_user_status(t.uid(16), 'active')$$, 'and lifted again');
select t.eq($$select (r ->> 'created') from (select public.regenerate_fixtures(t.id('comp'), true) r) x$$, '5', 'fixtures regenerated (5 pairings)');
select t.eq($$select (details ->> 'count') from public.audit_log where action = 'fixtures_created' order by id desc limit 1$$, '5', 'a regeneration is one log line, not one per match');
select t.eq($$select (count(*) >= 1)::text from public.audit_log where entity = 'results' and details ? 'status'$$, 'true', 'approved results are in the log');
select t.fails($$delete from public.audit_log$$, 'nobody can delete audit entries');
select t.fails($$update public.audit_log set action = 'x'$$, 'nobody can edit audit entries');
select t.fails($$insert into public.audit_log (action, entity) values ('fake', 'fake')$$, 'nobody can write audit entries by hand');
select t.login(t.uid(2));
select t.eq($$select count(*)::text from public.audit_log$$, '0', 'players cannot read the audit log');
select t.login(:'nov_admin');
select t.eq($$select count(*)::text from public.audit_log where competition_id = t.id('comp')$$, '0', 'another competition''s admin cannot read this log');
select t.login(:'owner');
select t.eq($$select (count(*) > 0)::text from public.audit_log where competition_id = t.id('comp')$$, 'true', 'the platform owner can read it');
select t.login(:'admin');
select t.eq($$select (count(*) > 0)::text from public.audit_log where competition_id = t.id('comp')$$, 'true', 'this competition''s admin can read it');

-- ═══ Awards and voting ═══
select t.login(t.uid(2));
select t.fails($$insert into public.awards (competition_id, title) values (t.id('comp'), 'Hack')$$, 'player cannot create awards');
select t.login(:'admin');
select t.ok($$insert into public.awards (competition_id, title, description, nominee_kind, sort) values (t.id('comp'), 'Player of the series', 'Most valuable player', 'player', 1), (t.id('comp'), 'Spirit of the tribe', 'Best tribe', 'tribe', 2)$$, 'admin creates a player award and a tribe award');
select t.root();
select id as aw_mvp from public.awards where title = 'Player of the series' and competition_id = t.id('comp') \gset
select id as aw_tribe from public.awards where title = 'Spirit of the tribe' and competition_id = t.id('comp') \gset
select t.login(t.uid(2));
select t.eq($$select count(*)::text from public.awards where competition_id = t.id('comp')$$, '0', 'awards are hidden from players until voting opens or winners are published');
select t.fails(format($$select public.cast_vote(%L, t.id('r03'))$$, :'aw_mvp'), 'cannot vote before voting opens');
select t.login(:'admin');
select t.ok(format($$update public.awards set voting_open = true where id = %L$$, :'aw_mvp'), 'admin opens voting for the player award');
select t.login(t.uid(2));
select t.eq($$select count(*)::text from public.awards where competition_id = t.id('comp')$$, '1', 'players now see the open award only');
select t.eq(format($$select count(*)::text from public.vote_nominees where award_id = %L$$, :'aw_mvp'), '16', 'the nominee list shows names of all approved players');
select t.ok(format($$select public.cast_vote(%L, t.id('r03'))$$, :'aw_mvp'), 'a player votes');
select t.ok(format($$select public.cast_vote(%L, t.id('r04'))$$, :'aw_mvp'), 'and can change their vote');
select t.eq(format($$select count(*)::text from public.award_votes where award_id = %L$$, :'aw_mvp'), '1', 'still exactly one vote each');
select t.fails(format($$select public.cast_vote(%L, t.id('r02'))$$, :'aw_mvp'), 'you cannot vote for yourself');
select t.fails(format($$select public.cast_vote(%L, gen_random_uuid())$$, :'aw_mvp'), 'the nominee must be a real approved player');
select t.fails(format($$select public.cast_vote(%L, t.id('tA'))$$, :'aw_tribe'), 'a closed award takes no votes');
select t.login(t.uid(5));
select t.ok(format($$select public.cast_vote(%L, t.id('r04'))$$, :'aw_mvp'), 'another player votes for the same nominee');
select t.eq(format($$select count(*)::text from public.award_votes where award_id = %L$$, :'aw_mvp'), '1', 'secret ballot: you can only read your own vote');
select t.login(:'nov_player');
select t.fails(format($$select public.cast_vote(%L, t.id('r04'))$$, :'aw_mvp'), 'a player from another competition cannot vote');
select t.eq(format($$select count(*)::text from public.vote_nominees where award_id = %L$$, :'aw_mvp'), '0', 'and cannot see the nominees');
select t.login(:'admin');
select t.eq(format($$select count(*)::text from public.award_votes where award_id = %L$$, :'aw_mvp'), '0', 'even admins cannot read who voted for whom');
select t.eq(format($$select (select name from public.award_tally(%L) limit 1) || '/' || (select votes from public.award_tally(%L) limit 1)$$, :'aw_mvp', :'aw_mvp'), 'Player 04/2', 'admins see anonymous totals: Player 04 has 2 votes');
select t.login(t.uid(2));
select t.fails(format($$select * from public.award_tally(%L)$$, :'aw_mvp'), 'players cannot see the tally');
-- tribe award
select t.login(:'admin');
select t.ok(format($$update public.awards set voting_open = true where id = %L$$, :'aw_tribe'), 'admin opens the tribe award');
select t.login(t.uid(1));   -- Alpha member
select t.fails(format($$select public.cast_vote(%L, t.id('tA'))$$, :'aw_tribe'), 'you cannot vote for your own tribe');
select t.ok(format($$select public.cast_vote(%L, t.id('tB'))$$, :'aw_tribe'), 'but you can vote for another tribe');
-- winners and publishing
select t.login(t.uid(2));
select t.fails(format($$select public.set_award_winner(%L, t.id('r04'))$$, :'aw_mvp'), 'player cannot choose winners');
select t.login(:'admin');
select t.fails(format($$select public.set_award_winner(%L, gen_random_uuid())$$, :'aw_mvp'), 'a winner must be a valid nominee');
select t.ok(format($$select public.set_award_winner(%L, t.id('r04'))$$, :'aw_mvp'), 'admin chooses the player winner');
select t.ok(format($$select public.set_award_winner(%L, t.id('tB'))$$, :'aw_tribe'), 'admin chooses the tribe winner');
select t.login(t.uid(2));
select t.eq($$select count(*)::text from public.award_winners where competition_id = t.id('comp')$$, '0', 'winners are secret until published');
select t.eq($$select count(*)::text from public.award_results$$, '0', 'players cannot read the results table');
select t.login(:'admin');
select t.eq($$select count(*)::text from public.award_winners where competition_id = t.id('comp')$$, '2', 'admin sees the chosen winners');
select t.eq($$select public.publish_awards(t.id('comp'), true)::text$$, '2', 'admin publishes both awards');
select t.login(t.uid(2));
select t.eq($$select string_agg(winner_name, ',' order by sort) from public.award_winners where competition_id = t.id('comp')$$, 'Player 04,Bravo', 'players now see the winners');
select t.eq($$select count(*)::text from public.awards where competition_id = t.id('comp') and voting_open$$, '0', 'publishing closes voting');
select t.fails(format($$select public.cast_vote(%L, t.id('r05'))$$, :'aw_mvp'), 'no votes after publishing');
select t.eq($$select count(*)::text from public.feed_events where kind = 'awards_published'$$, '1', 'publishing appears in the feed');
select t.login(t.uid(3));
select t.fails($$select public.publish_awards(t.id('comp'), false)$$, 'player cannot unpublish');
select t.login(:'admin');
select t.ok($$select public.publish_awards(t.id('comp'), false)$$, 'admin can unpublish');
select t.login(t.uid(2));
select t.eq($$select count(*)::text from public.award_winners where competition_id = t.id('comp')$$, '0', 'unpublished winners disappear again');
-- points are untouched by awards, votes and winners
select t.root();
select t.eq(format($$select (coalesce(sum(points), 0) = %s)::text from public.standings where competition_id = t.id('comp')$$, :'pts_before'), 'true', 'awards and voting never change tribal points');
select t.eq(format($$select (coalesce(sum(pts_for), 0) = %s)::text from public.americano_standings where competition_id = t.id('comp')$$, :'amer_before'), 'true', 'nor Americano points');

-- ═══ Notification preferences ═══
select t.login(t.uid(2));
select t.ok($$insert into public.notification_prefs (user_id, results, announcements) values (t.uid(2), false, true)$$, 'a player saves their preferences');
select t.fails($$insert into public.notification_prefs (user_id) values (t.uid(3))$$, 'cannot create preferences for someone else');
select t.ok($$update public.notification_prefs set fixtures = false where user_id = t.uid(2)$$, 'a player updates their own preferences');
select t.login(t.uid(3));
select t.eq($$select count(*)::text from public.notification_prefs$$, '0', 'preferences are private');
select t.ok($$update public.notification_prefs set results = true$$, 'updating others'' preferences is silently filtered');
select t.root();
select t.eq($$select results::text || '/' || fixtures::text from public.notification_prefs where user_id = t.uid(2)$$, 'false/false', 'and changes nothing');
select t.anon();
select t.fails($$select * from public.notification_prefs$$, 'anon cannot read preferences');
select t.fails($$select * from public.awards$$, 'anon cannot read awards');
select t.fails($$select public.cast_vote(gen_random_uuid(), gen_random_uuid())$$, 'anon cannot vote');
select t.root();
\o
