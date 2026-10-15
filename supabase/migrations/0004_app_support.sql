-- 0004_app_support: payment instructions (EFT) visible only to registrants/admins, and a "who am I" helper.

create function public.has_registration(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.registrations
                 where competition_id = cid and user_id = auth.uid() and status in ('pending', 'approved', 'waitlisted')) $$;

create table public.payment_info (
  competition_id uuid primary key references public.competitions(id) on delete cascade,
  instructions text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.payment_info enable row level security;
create policy payment_info_select on public.payment_info for select to authenticated
  using (public.is_comp_admin(competition_id) or public.has_registration(competition_id));
create policy payment_info_insert on public.payment_info for insert to authenticated
  with check (public.is_comp_admin(competition_id));
create policy payment_info_update on public.payment_info for update to authenticated
  using (public.is_comp_admin(competition_id)) with check (public.is_comp_admin(competition_id));
grant select, insert on public.payment_info to authenticated;
grant update (instructions, updated_at) on public.payment_info to authenticated;

create function public.my_roles() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'is_owner', public.is_platform_owner(),
    'admin_of', coalesce((select jsonb_agg(competition_id) from public.competition_admins where user_id = auth.uid()), '[]'::jsonb)) $$;

revoke all on function public.has_registration(uuid), public.my_roles() from public, anon;
grant execute on function public.has_registration(uuid), public.my_roles() to authenticated;
