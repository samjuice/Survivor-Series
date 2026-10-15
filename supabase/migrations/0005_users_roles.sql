-- 0005_users_roles: server-side user management. Every function checks the caller's role itself;
-- no service key ever reaches the browser. (Equivalent to Edge Functions, but testable in SQL.)

create function public.list_users(p_competition uuid default null)
returns table (user_id uuid, full_name text, display_name text, email text, status text, created_at timestamptz, registrations int, is_owner boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_competition is null then
    if not public.is_platform_owner() then raise exception 'Only the platform owner can list every user' using errcode = '42501'; end if;
    return query select p.id, p.full_name, p.display_name, u.email::text, p.status, p.created_at,
        (select count(*)::int from public.registrations r where r.user_id = p.id),
        exists (select 1 from public.platform_owners o where o.user_id = p.id)
      from public.profiles p join auth.users u on u.id = p.id order by p.created_at desc limit 1000;
  else
    if not public.is_comp_admin(p_competition) then raise exception 'Only an administrator can list users' using errcode = '42501'; end if;
    return query select p.id, p.full_name, p.display_name, u.email::text, p.status, p.created_at,
        (select count(*)::int from public.registrations r where r.user_id = p.id),
        exists (select 1 from public.platform_owners o where o.user_id = p.id)
      from public.profiles p join auth.users u on u.id = p.id
      where exists (select 1 from public.registrations r where r.user_id = p.id and r.competition_id = p_competition)
      order by p.created_at desc limit 1000;
  end if;
end $$;

create function public.set_user_status(p_user uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_status not in ('active', 'suspended') then raise exception 'Status must be active or suspended' using errcode = '22023'; end if;
  if p_user = auth.uid() then raise exception 'You cannot change your own status' using errcode = '42501'; end if;
  if exists (select 1 from public.platform_owners where user_id = p_user) then raise exception 'The platform owner cannot be suspended' using errcode = '42501'; end if;
  if not (public.is_platform_owner() or exists (select 1 from public.registrations r where r.user_id = p_user and public.is_comp_admin(r.competition_id))) then
    raise exception 'Only an administrator of one of this player''s competitions can do that' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_user and status <> 'deleted') then raise exception 'User not found' using errcode = 'P0002'; end if;
  update public.profiles set status = p_status where id = p_user;
  update auth.users set banned_until = case when p_status = 'suspended' then now() + interval '100 years' else null end where id = p_user;
end $$;

-- Deleting prefers keeping history: players with registrations are anonymised and blocked; players with none are removed.
create function public.delete_user(p_user uuid, p_confirm boolean) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_owner() then raise exception 'Only the platform owner can delete users' using errcode = '42501'; end if;
  if p_confirm is not true then raise exception 'Confirmation required' using errcode = '22023'; end if;
  if p_user = auth.uid() then raise exception 'You cannot delete yourself' using errcode = '42501'; end if;
  if exists (select 1 from public.platform_owners where user_id = p_user) then raise exception 'The platform owner cannot be deleted' using errcode = '42501'; end if;
  if exists (select 1 from public.team_members tm join public.registrations r on r.id = tm.registration_id where r.user_id = p_user and tm.left_at is null) then
    raise exception 'Replace this player on their tribe first, then delete them' using errcode = '23514';
  end if;
  delete from public.competition_admins where user_id = p_user;
  if not exists (select 1 from public.registrations where user_id = p_user)
     and not exists (select 1 from public.results where submitted_by = p_user)
     and not exists (select 1 from public.announcements where created_by = p_user)
     and not exists (select 1 from public.competitions where created_by = p_user) then
    delete from public.profiles where id = p_user;
    delete from auth.users where id = p_user;
    return 'deleted';
  end if;
  update public.registrations set status = 'withdrawn' where user_id = p_user and status in ('pending', 'waitlisted');
  update public.profiles set full_name = 'Deleted player', display_name = null, status = 'deleted' where id = p_user;
  delete from auth.identities where user_id = p_user;
  update auth.users set email = 'deleted+' || p_user::text || '@deleted.invalid', encrypted_password = null,
    raw_user_meta_data = '{}'::jsonb, banned_until = now() + interval '100 years' where id = p_user;
  return 'anonymised';
end $$;

create function public.list_competition_admins(p_competition uuid)
returns table (user_id uuid, full_name text, email text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_comp_admin(p_competition) then raise exception 'Only an administrator can list admins' using errcode = '42501'; end if;
  return query select a.user_id, p.full_name, u.email::text from public.competition_admins a
    join auth.users u on u.id = a.user_id left join public.profiles p on p.id = a.user_id where a.competition_id = p_competition order by p.full_name;
end $$;

create function public.add_competition_admin(p_competition uuid, p_email text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare uid uuid;
begin
  if not public.is_platform_owner() then raise exception 'Only the platform owner can add admins' using errcode = '42501'; end if;
  select u.id into uid from auth.users u join public.profiles p on p.id = u.id
    where lower(u.email) = lower(trim(p_email)) and p.status = 'active';
  if uid is null then raise exception 'No active player with that email has signed up and finished their profile' using errcode = 'P0002'; end if;
  insert into public.competition_admins (competition_id, user_id) values (p_competition, uid) on conflict do nothing;
  return uid;
end $$;

create function public.remove_competition_admin(p_competition uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_owner() then raise exception 'Only the platform owner can remove admins' using errcode = '42501'; end if;
  delete from public.competition_admins where competition_id = p_competition and user_id = p_user;
end $$;

-- A paid placeholder becomes a real player: they keep the slot, the paid fee and any tribe place.
create function public.link_placeholder(p_placeholder uuid, p_registration uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare ph public.registrations; rg public.registrations;
begin
  select * into ph from public.registrations where id = p_placeholder;
  select * into rg from public.registrations where id = p_registration;
  if ph.id is null or rg.id is null then raise exception 'Registration not found' using errcode = 'P0002'; end if;
  if not public.is_comp_admin(ph.competition_id) then raise exception 'Only an administrator can link players' using errcode = '42501'; end if;
  if ph.user_id is not null then raise exception 'That is not a placeholder' using errcode = '23514'; end if;
  if rg.user_id is null or rg.competition_id <> ph.competition_id then raise exception 'Pick a signed-up player from the same competition' using errcode = '23514'; end if;
  if exists (select 1 from public.team_members where registration_id = rg.id and left_at is null) then
    raise exception 'That player is already on a tribe. Remove them from it first' using errcode = '23514';
  end if;
  delete from public.registrations where id = rg.id;
  update public.registrations set user_id = rg.user_id, placeholder_name = null where id = ph.id;
end $$;

revoke all on function public.list_users(uuid), public.set_user_status(uuid, text), public.delete_user(uuid, boolean),
  public.list_competition_admins(uuid), public.add_competition_admin(uuid, text), public.remove_competition_admin(uuid, uuid),
  public.link_placeholder(uuid, uuid) from public, anon;
grant execute on function public.list_users(uuid), public.set_user_status(uuid, text), public.delete_user(uuid, boolean),
  public.list_competition_admins(uuid), public.add_competition_admin(uuid, text), public.remove_competition_admin(uuid, uuid),
  public.link_placeholder(uuid, uuid) to authenticated;
