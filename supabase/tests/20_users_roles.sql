-- Tests for 0005_users_roles. Continues on the database prepared by 10_rls_and_rules.sql.
\set QUIET on
\o /dev/null
\set owner '00000000-0000-0000-0000-0000000000a1'
\set admin '00000000-0000-0000-0000-0000000000a2'
\set p1 '00000000-0000-0000-0000-0000000000b1'
\set c1 '00000000-0000-0000-0000-0000000000c1'
\set d1 '00000000-0000-0000-0000-0000000000d1'
\set e1 '00000000-0000-0000-0000-0000000000e1'
\set z1 '00000000-0000-0000-0000-0000000000f1'
\set z2 '00000000-0000-0000-0000-0000000000f2'
select t.root();
select id as comp from public.competitions where slug = 'nov-2026' \gset
insert into auth.users (id, email, email_confirmed_at) values (:'z1', 'newadmin@example.test', now()), (:'z2', 'lonely@example.test', now());
insert into public.profiles (id, full_name) values (:'z1', 'New Admin'), (:'z2', 'Lonely User');
insert into auth.identities (user_id) values (:'d1'), (:'z2');

-- listing
select t.login(:'owner');
select t.ok($$select * from public.list_users()$$, 'owner can list every user');
select t.eq($$select (count(*) >= 9)::text from public.list_users()$$, 'true', 'owner sees all profiles');
select t.login(:'admin');
select t.fails($$select * from public.list_users()$$, 'competition admin cannot list every user');
select t.eq(format($$select count(*)::text from public.list_users(%L)$$, :'comp'), '7', 'admin lists only their competition''s registrants');
select t.login(:'p1');
select t.fails(format($$select * from public.list_users(%L)$$, :'comp'), 'player cannot list users');

-- suspend / unsuspend
select t.login(:'admin');
select t.ok(format($$select public.set_user_status(%L, 'suspended')$$, :'p1'), 'admin suspends a registrant');
select t.root();
select t.eq(format($$select status || '/' || (banned_until is not null)::text from public.profiles p join auth.users u on u.id = p.id where p.id = %L$$, :'p1'), 'suspended/true', 'suspension also blocks sign-in (ban set)');
select t.login(:'p1');
select t.fails(format($$insert into public.registrations (competition_id, user_id) values (%L, %L)$$, :'comp', :'e1'), 'suspended player cannot act');
select t.fails(format($$select public.set_user_status(%L, 'active')$$, :'p1'), 'a suspended player cannot unsuspend themselves');
select t.login(:'admin');
select t.ok(format($$select public.set_user_status(%L, 'active')$$, :'p1'), 'admin unsuspends');
select t.root();
select t.eq(format($$select (banned_until is null)::text from auth.users where id = %L$$, :'p1'), 'true', 'unsuspending lifts the ban');
select t.login(:'admin');
select t.fails(format($$select public.set_user_status(%L, 'suspended')$$, :'owner'), 'the platform owner cannot be suspended');
select t.fails(format($$select public.set_user_status(%L, 'suspended')$$, :'e1'), 'admin cannot suspend someone outside their competition');
select t.fails(format($$select public.set_user_status(%L, 'banana')$$, :'p1'), 'only active/suspended are valid statuses');
select t.login(:'p1');
select t.fails(format($$select public.set_user_status(%L, 'suspended')$$, :'c1'), 'a player cannot suspend anyone');
select t.login(:'owner');
select t.fails(format($$select public.set_user_status(%L, 'suspended')$$, :'owner'), 'nobody can change their own status');

-- placeholder linking
select t.login(:'admin');
select t.ok(format($$insert into public.registrations (competition_id, placeholder_name, status, payment_status) values (%L, 'Linda Placeholder', 'approved', 'paid')$$, :'comp'), 'admin adds a paid placeholder');
select t.root();
select id as r_linda from public.registrations where placeholder_name = 'Linda Placeholder' \gset
select id as r_d1 from public.registrations where user_id = :'d1' \gset
select id as r_c2 from public.registrations where user_id = '00000000-0000-0000-0000-0000000000c2' \gset
select t.login(:'p1');
select t.fails(format($$select public.link_placeholder(%L, %L)$$, :'r_linda', :'r_d1'), 'player cannot link a placeholder');
select t.login(:'admin');
select t.fails(format($$select public.link_placeholder(%L, %L)$$, :'r_linda', :'r_c2'), 'cannot link a player who is already on a tribe');
select t.fails(format($$select public.link_placeholder(%L, %L)$$, :'r_d1', :'r_d1'), 'cannot link something that is not a placeholder');
select t.ok(format($$select public.link_placeholder(%L, %L)$$, :'r_linda', :'r_d1'), 'admin links a placeholder to a signed-up player');
select t.root();
select t.eq(format($$select (user_id = %L)::text || '/' || payment_status || '/' || status || '/' || coalesce(placeholder_name, 'none') from public.registrations where id = %L$$, :'d1', :'r_linda'), 'true/paid/approved/none', 'the placeholder keeps its paid fee and approved slot');
select t.eq(format($$select count(*)::text from public.registrations where user_id = %L$$, :'d1'), '1', 'the player''s duplicate registration is gone');

-- admins by email
select t.login(:'admin');
select t.fails(format($$select public.add_competition_admin(%L, 'newadmin@example.test')$$, :'comp'), 'only the owner can add admins');
select t.login(:'owner');
select t.fails(format($$select public.add_competition_admin(%L, 'nobody@example.test')$$, :'comp'), 'unknown email is refused with a clear message');
select t.ok(format($$select public.add_competition_admin(%L, 'NewAdmin@Example.test')$$, :'comp'), 'owner adds an admin by email (case-insensitive)');
select t.login(:'z1');
select t.eq(format($$select count(*)::text from public.list_users(%L)$$, :'comp'), '7', 'the new admin can now manage the competition');
select t.eq(format($$select count(*)::text from public.list_competition_admins(%L)$$, :'comp'), '2', 'admins can see who the admins are');
select t.login(:'owner');
select t.ok(format($$select public.remove_competition_admin(%L, %L)$$, :'comp', :'z1'), 'owner removes the admin');
select t.login(:'z1');
select t.fails(format($$select * from public.list_users(%L)$$, :'comp'), 'a removed admin loses access immediately');

-- deleting users
select t.login(:'admin');
select t.fails(format($$select public.delete_user(%L, true)$$, :'z2'), 'only the owner can delete users');
select t.login(:'owner');
select t.fails(format($$select public.delete_user(%L, false)$$, :'z2'), 'deleting needs explicit confirmation');
select t.fails(format($$select public.delete_user(%L, true)$$, :'c1'), 'a player who is on a tribe cannot be deleted');
select t.fails(format($$select public.delete_user(%L, true)$$, :'owner'), 'the owner cannot be deleted (or delete themselves)');
select t.eq(format($$select public.delete_user(%L, true)$$, :'z2'), 'deleted', 'a user with no history is removed completely');
select t.eq(format($$select public.delete_user(%L, true)$$, :'d1'), 'anonymised', 'a user with history is anonymised, not erased');
select t.root();
select t.eq(format($$select count(*)::text from auth.users where id = %L$$, :'z2'), '0', 'the removed user is gone from auth');
select t.eq(format($$select p.full_name || '/' || p.status || '/' || (u.email like 'deleted+%%@deleted.invalid')::text || '/' || (u.banned_until is not null)::text from public.profiles p join auth.users u on u.id = p.id where p.id = %L$$, :'d1'), 'Deleted player/deleted/true/true', 'anonymised: name wiped, email replaced, sign-in blocked');
select t.eq(format($$select count(*)::text from auth.identities where user_id = %L$$, :'d1'), '0', 'anonymised: login identities removed');
select t.eq(format($$select count(*)::text from public.registrations where user_id = %L and status = 'approved'$$, :'d1'), '1', 'anonymised: payment and registration history kept');

-- API surface
select t.anon();
select t.fails($$select * from public.list_users()$$, 'anon cannot call list_users');
select t.fails($$select public.delete_user(gen_random_uuid(), true)$$, 'anon cannot call delete_user');
select t.root();
\o
