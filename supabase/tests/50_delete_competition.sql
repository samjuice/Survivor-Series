-- Regression: a draft competition with registrations, tribes and history can be deleted by the owner.
\set QUIET on
\o /dev/null
\set owner '00000000-0000-0000-0000-0000000000a1'
select t.root();
insert into public.competitions (name, slug, phase, capacity, team_size) values ('Delete me', 'delete-me', 'draft', 8, 2);
insert into t.ids select 'delcomp', id from public.competitions where slug = 'delete-me';
insert into public.registrations (competition_id, user_id, status, payment_status) select t.id('delcomp'), t.uid(n), 'approved', 'paid' from generate_series(1, 2) n;
insert into public.teams (competition_id, name) values (t.id('delcomp'), 'Temp');
insert into public.team_members (team_id, registration_id, is_captain) select (select id from public.teams where competition_id = t.id('delcomp')), id, false from public.registrations where competition_id = t.id('delcomp') limit 2;
insert into public.announcements (competition_id, title) values (t.id('delcomp'), 'Temporary');
select t.login(:'owner');
select t.eq($$select count(*)::text from public.audit_log where competition_id = t.id('delcomp')$$, '7', 'the setup was audited (2 registrations, tribe, 2 members, announcement, competition) before deletion') ;
select t.ok($$delete from public.competitions where id = t.id('delcomp')$$, 'the owner can delete a draft competition that has registrations, tribes and an audit trail');
select t.root();
select t.eq($$select count(*)::text from public.registrations where competition_id = t.id('delcomp')$$, '0', 'its registrations are gone');
select t.eq($$select (count(*) > 0)::text from public.audit_log where competition_id = t.id('delcomp')$$, 'true', 'but the audit trail survives');
select t.login('00000000-0000-0000-0000-0000000000a2');
select t.eq($$select count(*)::text from public.audit_log where competition_id = t.id('delcomp')$$, '0', 'and is visible only to the platform owner afterwards');

-- the biggest case: the whole Stage 2/3 competition (fixtures, results, line-ups, Americano, awards, votes)
select t.root();
update public.competitions set phase = 'draft' where id = t.id('comp');
select t.eq($$select (select count(*) from public.fixtures where competition_id = t.id('comp'))::int + (select count(*) from public.lineups where competition_id = t.id('comp'))::int + (select count(*) from public.americano_matches where competition_id = t.id('comp'))::int + (select count(*) from public.award_votes) > 20$$ || '', 'true', 'the full competition has plenty of linked data to delete');
select t.login(:'owner');
select t.ok($$delete from public.competitions where id = t.id('comp')$$, 'the owner can delete a full competition with fixtures, results, line-ups, Americano and awards');
select t.root();
select t.eq($$select (select count(*) from public.fixtures where competition_id = t.id('comp')) + (select count(*) from public.teams where competition_id = t.id('comp')) + (select count(*) from public.registrations where competition_id = t.id('comp')) + (select count(*) from public.americano_events where competition_id = t.id('comp'))$$ || '', '0', 'everything belonging to it is gone');
-- deleting ONE thing that is still in use is still refused
insert into public.competitions (name, slug, phase, capacity, team_size) values ('Guard', 'guard', 'registration', 4, 2);
insert into t.ids select 'gcomp', id from public.competitions where slug = 'guard';
insert into public.registrations (competition_id, user_id, status) values (t.id('gcomp'), t.uid(1), 'approved');
insert into public.teams (competition_id, name) values (t.id('gcomp'), 'Guarded');
insert into public.team_members (team_id, registration_id) select (select id from public.teams where competition_id = t.id('gcomp')), id from public.registrations where competition_id = t.id('gcomp');
select t.fails($$delete from public.registrations where competition_id = t.id('gcomp'); set constraints all immediate$$, 'a registration that is on a tribe still cannot be deleted on its own');
select t.root();
\o
