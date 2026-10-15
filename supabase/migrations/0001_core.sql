-- 0001_core: tables, role helpers, RLS policies, explicit grants.
-- "Automatically expose new tables" is OFF on this project, so every table is
-- granted explicitly below, and RLS is enabled on every table.

-- ───────────────────────── Tables ─────────────────────────
create table public.profiles (
  id uuid primary key references auth.users(id),   -- no cascade: history must survive; deletions anonymise
  full_name text not null check (length(trim(full_name)) between 2 and 80),
  display_name text check (display_name is null or length(trim(display_name)) between 1 and 40),
  status text not null default 'active' check (status in ('active','suspended','deleted')),
  created_at timestamptz not null default now()
);

create table public.platform_owners (
  user_id uuid primary key references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.competitions (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  phase text not null default 'draft'
    check (phase in ('draft','registration','opening','tribal','finale','completed')),
  capacity int not null default 20 check (capacity > 0),
  team_size int not null default 4 check (team_size >= 2),
  entry_fee_cents int not null default 0 check (entry_fee_cents >= 0),
  admin_fee_cents int not null default 0 check (admin_fee_cents >= 0),
  prize_pool_override_cents int check (prize_pool_override_cents is null or prize_pool_override_cents >= 0),
  points_per_win int not null default 3 check (points_per_win > 0),
  starts_on date,
  completion_target date,
  show_table boolean not null default false,       -- phases control what players may see
  show_fixtures boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.competition_admins (
  competition_id uuid not null references public.competitions(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (competition_id, user_id)
);

create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  user_id uuid references auth.users(id),           -- null = placeholder for a paid player who has not signed up
  placeholder_name text check (placeholder_name is null or length(trim(placeholder_name)) > 0),
  status text not null default 'pending'
    check (status in ('pending','approved','waitlisted','rejected','withdrawn')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','paid')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  check (user_id is not null or placeholder_name is not null),
  unique (competition_id, user_id)
);
create index registrations_comp_idx on public.registrations (competition_id, status);
create index registrations_user_idx on public.registrations (user_id);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  emblem_key text,                                   -- built-in SVG emblem key, replaceable by admins
  color text,
  status text not null default 'active' check (status in ('active','withdrawn')),
  revealed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (competition_id, name)
);

create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  registration_id uuid not null references public.registrations(id),
  is_captain boolean not null default false,
  joined_at timestamptz not null default now(),
  left_at timestamptz                                -- set on replacement; keeps history
);
create unique index team_members_one_active on public.team_members (registration_id) where left_at is null;
create unique index team_members_one_captain on public.team_members (team_id) where is_captain and left_at is null;
create index team_members_team_idx on public.team_members (team_id);

create table public.fixtures (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  round int not null check (round > 0),
  team_a uuid not null references public.teams(id),
  team_b uuid not null references public.teams(id),
  scheduled_at timestamptz,
  status text not null default 'scheduled' check (status in ('scheduled','played','walkover','cancelled')),
  created_at timestamptz not null default now(),
  check (team_a <> team_b),
  check (team_a < team_b),                           -- canonical order: one row per pairing
  unique (competition_id, team_a, team_b)
);
create index fixtures_comp_idx on public.fixtures (competition_id, round);

create table public.results (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  fixture_id uuid not null unique references public.fixtures(id) on delete cascade,
  submitted_by uuid references auth.users(id),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  walkover boolean not null default false,
  winner_team uuid not null references public.teams(id),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  reject_reason text,
  created_at timestamptz not null default now()
);
create index results_comp_idx on public.results (competition_id, status);

create table public.result_sets (
  result_id uuid not null references public.results(id) on delete cascade,
  set_no smallint not null check (set_no between 1 and 3),
  a_games smallint not null,                         -- games won by fixture.team_a
  b_games smallint not null,                         -- games won by fixture.team_b
  primary key (result_id, set_no),
  constraint valid_set check (
       (a_games = 6 and b_games between 0 and 4)
    or (b_games = 6 and a_games between 0 and 4)
    or (a_games = 7 and b_games in (5, 6))
    or (b_games = 7 and a_games in (5, 6)))
);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  body text not null default '',
  pinned boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index announcements_comp_idx on public.announcements (competition_id, pinned desc, created_at desc);

create table public.feed_events (
  id bigint generated always as identity primary key,
  competition_id uuid not null references public.competitions(id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,        -- never contains payment details
  created_at timestamptz not null default now()
);
create index feed_comp_idx on public.feed_events (competition_id, id desc);

-- ───────────────────── Role helper functions ─────────────────────
-- SECURITY DEFINER so policies can ask "who is this?" without recursive RLS.
create function public.is_platform_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_owners where user_id = auth.uid()) $$;

create function public.is_comp_admin(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_platform_owner()
      or exists (select 1 from public.competition_admins where competition_id = cid and user_id = auth.uid()) $$;

create function public.is_comp_member(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.registrations
                 where competition_id = cid and user_id = auth.uid() and status = 'approved') $$;

create function public.is_active_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and status = 'active') $$;

create function public.is_team_captain(tid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.team_members tm join public.registrations r on r.id = tm.registration_id
                 where tm.team_id = tid and tm.is_captain and tm.left_at is null and r.user_id = auth.uid()) $$;

create function public.is_team_member(tid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.team_members tm join public.registrations r on r.id = tm.registration_id
                 where tm.team_id = tid and tm.left_at is null and r.user_id = auth.uid()) $$;

create function public.is_fixture_captain(fid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.fixtures f
                 where f.id = fid and (public.is_team_captain(f.team_a) or public.is_team_captain(f.team_b))) $$;

create function public.comp_is_public(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.competitions where id = cid and phase <> 'draft') $$;

create function public.comp_shows_fixtures(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.competitions where id = cid and phase <> 'draft' and show_fixtures) $$;

create function public.comp_shows_table(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.competitions where id = cid and phase <> 'draft' and show_table) $$;

create function public.can_see_profile(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select pid = auth.uid() or public.is_platform_owner()
      or exists (select 1 from public.registrations r
                 where r.user_id = pid
                   and (public.is_comp_admin(r.competition_id)
                        or (r.status = 'approved' and public.is_comp_member(r.competition_id)))) $$;

revoke all on function public.is_platform_owner(), public.is_comp_admin(uuid), public.is_comp_member(uuid),
  public.is_active_user(), public.is_team_captain(uuid), public.is_team_member(uuid), public.is_fixture_captain(uuid),
  public.comp_is_public(uuid), public.comp_shows_fixtures(uuid), public.comp_shows_table(uuid), public.can_see_profile(uuid)
  from public, anon;
grant execute on function public.is_platform_owner(), public.is_comp_admin(uuid), public.is_comp_member(uuid),
  public.is_active_user(), public.is_team_captain(uuid), public.is_team_member(uuid), public.is_fixture_captain(uuid),
  public.comp_is_public(uuid), public.comp_shows_fixtures(uuid), public.comp_shows_table(uuid), public.can_see_profile(uuid)
  to authenticated;

-- ───────────────────────── RLS ─────────────────────────
alter table public.profiles           enable row level security;
alter table public.platform_owners    enable row level security;  -- no policies, no grants: SQL/service role only
alter table public.competitions       enable row level security;
alter table public.competition_admins enable row level security;
alter table public.registrations      enable row level security;
alter table public.teams              enable row level security;
alter table public.team_members       enable row level security;
alter table public.fixtures           enable row level security;
alter table public.results            enable row level security;
alter table public.result_sets        enable row level security;
alter table public.announcements      enable row level security;
alter table public.feed_events        enable row level security;

-- profiles
create policy profiles_select on public.profiles for select to authenticated using (public.can_see_profile(id));
create policy profiles_insert on public.profiles for insert to authenticated
  with check (id = auth.uid() and status = 'active');
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- competitions
create policy comps_select_public on public.competitions for select to anon, authenticated using (phase <> 'draft');
create policy comps_select_admin  on public.competitions for select to authenticated using (public.is_comp_admin(id));
create policy comps_insert on public.competitions for insert to authenticated with check (public.is_platform_owner());
create policy comps_update on public.competitions for update to authenticated
  using (public.is_comp_admin(id)) with check (public.is_comp_admin(id));
create policy comps_delete on public.competitions for delete to authenticated
  using (public.is_platform_owner() and phase = 'draft');

-- competition_admins (role assignment is owner-only here; richer flows go through Edge Functions)
create policy cadmins_select on public.competition_admins for select to authenticated
  using (user_id = auth.uid() or public.is_comp_admin(competition_id));
create policy cadmins_insert on public.competition_admins for insert to authenticated with check (public.is_platform_owner());
create policy cadmins_delete on public.competition_admins for delete to authenticated using (public.is_platform_owner());

-- registrations (payment info lives here, so only the owner and admins can read)
create policy regs_select on public.registrations for select to authenticated
  using (user_id = auth.uid() or public.is_comp_admin(competition_id));
create policy regs_insert_self on public.registrations for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending' and payment_status = 'unpaid'
              and paid_at is null and placeholder_name is null and public.is_active_user()
              and exists (select 1 from public.competitions c where c.id = competition_id and c.phase = 'registration'));
create policy regs_insert_admin on public.registrations for insert to authenticated
  with check (public.is_comp_admin(competition_id));
create policy regs_update on public.registrations for update to authenticated
  using (user_id = auth.uid() or public.is_comp_admin(competition_id))
  with check (user_id = auth.uid() or public.is_comp_admin(competition_id));
create policy regs_delete on public.registrations for delete to authenticated using (public.is_comp_admin(competition_id));

-- teams
create policy teams_select on public.teams for select to authenticated
  using (public.is_comp_admin(competition_id)
         or (revealed and public.comp_is_public(competition_id))
         or public.is_team_member(id));
create policy teams_write_admin on public.teams for all to authenticated
  using (public.is_comp_admin(competition_id)) with check (public.is_comp_admin(competition_id));

-- team_members (everyone else reads rosters through the public.roster view)
create policy tm_select on public.team_members for select to authenticated
  using (public.is_team_member(team_id)
         or public.is_comp_admin((select t.competition_id from public.teams t where t.id = team_id)));
create policy tm_write_admin on public.team_members for all to authenticated
  using (public.is_comp_admin((select t.competition_id from public.teams t where t.id = team_id)))
  with check (public.is_comp_admin((select t.competition_id from public.teams t where t.id = team_id)));

-- fixtures
create policy fixtures_select on public.fixtures for select to authenticated
  using (public.is_comp_admin(competition_id) or public.comp_shows_fixtures(competition_id));
create policy fixtures_update_admin on public.fixtures for update to authenticated
  using (public.is_comp_admin(competition_id)) with check (public.is_comp_admin(competition_id));

-- results (written only by the submit/review RPCs; only rejected ones can be deleted directly)
create policy results_select on public.results for select to authenticated
  using ((status = 'approved' and public.comp_shows_table(competition_id))
         or public.is_comp_admin(competition_id)
         or submitted_by = auth.uid()
         or public.is_fixture_captain(fixture_id));
create policy results_delete_rejected on public.results for delete to authenticated
  using (status = 'rejected' and public.is_comp_admin(competition_id));
create policy result_sets_select on public.result_sets for select to authenticated
  using (exists (select 1 from public.results r where r.id = result_id));

-- announcements
create policy ann_select on public.announcements for select to authenticated
  using (public.is_comp_admin(competition_id) or public.is_comp_member(competition_id));
create policy ann_write_admin on public.announcements for all to authenticated
  using (public.is_comp_admin(competition_id)) with check (public.is_comp_admin(competition_id));

-- feed
create policy feed_select on public.feed_events for select to authenticated
  using (public.is_comp_admin(competition_id) or public.is_comp_member(competition_id));

-- ───────────────────── Explicit grants (least privilege) ─────────────────────
grant select on public.competitions to anon;
grant select on public.profiles, public.competitions, public.competition_admins, public.registrations,
  public.teams, public.team_members, public.fixtures, public.results, public.result_sets,
  public.announcements, public.feed_events to authenticated;
grant insert on public.profiles, public.competitions, public.competition_admins, public.registrations,
  public.teams, public.team_members, public.announcements to authenticated;
grant update (full_name, display_name) on public.profiles to authenticated;
grant update on public.competitions, public.teams, public.announcements to authenticated;
grant update (status, payment_status, paid_at, user_id, placeholder_name) on public.registrations to authenticated;
grant update (is_captain, left_at) on public.team_members to authenticated;
grant update (scheduled_at) on public.fixtures to authenticated;
grant delete on public.competitions, public.competition_admins, public.registrations, public.teams,
  public.team_members, public.announcements, public.results to authenticated;
