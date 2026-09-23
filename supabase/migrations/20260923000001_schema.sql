-- Resource Hub: tables, security rules (RLS) and helper functions.
--
-- Plain-language summary
--   * Reference data (zones, locker nodes, walking times, item types, holidays)
--     can be read by anyone who is logged in. Only technicians can change it.
--   * Students only ever see their OWN reservations, loans and fault reports.
--   * Technicians can see and change everything.
--   * Maintenance officers see items, fault reports and maintenance records,
--     but not students' loans or reservations.
--   * Business actions (reserve, collect, return ...) will be added as
--     database functions in later phases so the rules are enforced in one place.

-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------

create table public.zones (
  id          text primary key,
  name        text not null,
  position    numeric(4,3) not null check (position between 0 and 1),
  created_at  timestamptz not null default now()
);

create table public.locker_nodes (
  id                 text primary key,
  name               text not null,
  place              text not null,
  position           numeric(4,3) not null check (position between 0 and 1),
  battery_backup_ok  boolean not null default true,
  online             boolean not null default true,
  created_at         timestamptz not null default now()
);

create table public.walk_times (
  zone_id     text not null references public.zones (id) on delete cascade,
  node_id     text not null references public.locker_nodes (id) on delete cascade,
  minutes     integer not null check (minutes >= 0),
  created_at  timestamptz not null default now(),
  primary key (zone_id, node_id)
);

create table public.item_types (
  id                   text primary key,
  name                 text not null,
  category             text not null,
  unit_cost_zar        numeric(10,2) not null check (unit_cost_zar >= 0),
  criticality          text not null check (criticality in ('safety', 'medium', 'low')),
  abc_class            text not null check (abc_class in ('A', 'B', 'C')),
  fsn_class            text not null check (fsn_class in ('F', 'S', 'N')),
  loan_hours_options   integer[] not null,
  service_after_loans  integer not null check (service_after_loans > 0),
  created_at           timestamptz not null default now()
);

create table public.public_holidays (
  day         date primary key,
  name        text not null,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------

-- One row per login. No student numbers, ID numbers or phone numbers.
create table public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  display_name   text not null,
  role           text not null check (role in ('student', 'technician', 'maintenance')),
  card_uid       text unique,
  faculty        text,
  year_of_study  integer check (year_of_study between 1 and 6),
  near_zone_id   text references public.zones (id) on delete set null,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Stock
-- ---------------------------------------------------------------------------

create table public.items (
  id               uuid primary key default gen_random_uuid(),
  item_type_id     text not null references public.item_types (id),
  tag              text not null unique,
  home_node_id     text not null references public.locker_nodes (id),
  current_node_id  text references public.locker_nodes (id),  -- null while on loan
  status           text not null default 'available'
                   check (status in ('available', 'reserved', 'on_loan', 'in_service', 'retired')),
  loan_count       integer not null default 0 check (loan_count >= 0),
  created_at       timestamptz not null default now()
);
create index items_type_idx on public.items (item_type_id);
create index items_current_node_idx on public.items (current_node_id);

create table public.compartments (
  id          uuid primary key default gen_random_uuid(),
  node_id     text not null references public.locker_nodes (id) on delete cascade,
  number      integer not null check (number > 0),
  size        text not null check (size in ('S', 'M', 'L')),
  item_id     uuid unique references public.items (id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (node_id, number)
);

-- ---------------------------------------------------------------------------
-- Activity
-- ---------------------------------------------------------------------------

create table public.reservations (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null references public.profiles (id) on delete cascade,
  item_id         uuid not null references public.items (id),
  node_id         text not null references public.locker_nodes (id),
  compartment_id  uuid references public.compartments (id) on delete set null,
  pin             text not null check (pin ~ '^[0-9]{4}$'),
  hold_until      timestamptz not null,
  status          text not null default 'active'
                  check (status in ('active', 'collected', 'cancelled', 'expired')),
  created_at      timestamptz not null default now()
);
create index reservations_student_idx on public.reservations (student_id);
create index reservations_item_idx on public.reservations (item_id);

-- Every time a student tries to reserve, successful or not. Used for fill rate.
create table public.reservation_attempts (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid references public.profiles (id) on delete set null,
  item_type_id  text not null references public.item_types (id),
  node_id       text references public.locker_nodes (id),
  succeeded     boolean not null,
  created_at    timestamptz not null default now()
);
create index reservation_attempts_created_idx on public.reservation_attempts (created_at);

create table public.loans (
  id                   uuid primary key default gen_random_uuid(),
  student_id           uuid not null references public.profiles (id) on delete cascade,
  item_id              uuid not null references public.items (id),
  issued_at            timestamptz not null default now(),
  due_at               timestamptz not null,
  returned_at          timestamptz,
  return_node_id       text references public.locker_nodes (id),
  extended             boolean not null default false,
  condition_on_return  text check (condition_on_return in ('good', 'minor', 'damaged')),
  created_at           timestamptz not null default now()
);
create index loans_student_idx on public.loans (student_id);
create index loans_item_idx on public.loans (item_id);
create index loans_issued_idx on public.loans (issued_at);

create sequence public.work_order_seq start 1001;

create table public.fault_reports (
  id              uuid primary key default gen_random_uuid(),
  reporter_id     uuid references public.profiles (id) on delete set null,
  item_id         uuid references public.items (id),
  node_id         text not null references public.locker_nodes (id),
  compartment_id  uuid references public.compartments (id) on delete set null,
  reason          text not null
                  check (reason in ('door_did_not_open', 'wrong_item', 'damaged', 'missing_part', 'other')),
  note            text check (char_length(note) <= 1000),
  photo_path      text,
  status          text not null default 'open' check (status in ('open', 'in_progress', 'closed')),
  work_order_ref  text not null unique
                  default 'WO-' || lpad(nextval('public.work_order_seq')::text, 4, '0'),
  created_at      timestamptz not null default now()
);
create index fault_reports_reporter_idx on public.fault_reports (reporter_id);

create table public.maintenance_records (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references public.items (id),
  trigger     text not null check (trigger in ('usage_threshold', 'fault_report')),
  opened_at   timestamptz not null default now(),
  closed_at   timestamptz,
  notes       text,
  created_at  timestamptz not null default now()
);
create index maintenance_records_item_idx on public.maintenance_records (item_id);

-- ---------------------------------------------------------------------------
-- Role helper
-- ---------------------------------------------------------------------------

-- The role of whoever is logged in ('student', 'technician', 'maintenance'),
-- or null when nobody is. SECURITY DEFINER so it can read profiles without
-- tripping over the profiles table's own RLS.
create function public.app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

revoke execute on function public.app_role() from public, anon;
grant execute on function public.app_role() to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security: switched on for every table
-- ---------------------------------------------------------------------------

alter table public.zones                enable row level security;
alter table public.locker_nodes         enable row level security;
alter table public.walk_times           enable row level security;
alter table public.item_types           enable row level security;
alter table public.public_holidays      enable row level security;
alter table public.profiles             enable row level security;
alter table public.items                enable row level security;
alter table public.compartments         enable row level security;
alter table public.reservations         enable row level security;
alter table public.reservation_attempts enable row level security;
alter table public.loans                enable row level security;
alter table public.fault_reports        enable row level security;
alter table public.maintenance_records  enable row level security;

-- Reference data and stock: any logged-in user reads, technicians write.
create policy "logged in can read" on public.zones           for select to authenticated using (true);
create policy "logged in can read" on public.locker_nodes    for select to authenticated using (true);
create policy "logged in can read" on public.walk_times      for select to authenticated using (true);
create policy "logged in can read" on public.item_types      for select to authenticated using (true);
create policy "logged in can read" on public.public_holidays for select to authenticated using (true);
create policy "logged in can read" on public.items           for select to authenticated using (true);
create policy "logged in can read" on public.compartments    for select to authenticated using (true);

create policy "technician manages" on public.zones           for all to authenticated
  using (public.app_role() = 'technician') with check (public.app_role() = 'technician');
create policy "technician manages" on public.locker_nodes    for all to authenticated
  using (public.app_role() = 'technician') with check (public.app_role() = 'technician');
create policy "technician manages" on public.walk_times      for all to authenticated
  using (public.app_role() = 'technician') with check (public.app_role() = 'technician');
create policy "technician manages" on public.item_types      for all to authenticated
  using (public.app_role() = 'technician') with check (public.app_role() = 'technician');
create policy "technician manages" on public.public_holidays for all to authenticated
  using (public.app_role() = 'technician') with check (public.app_role() = 'technician');
create policy "technician manages" on public.items           for all to authenticated
  using (public.app_role() = 'technician') with check (public.app_role() = 'technician');
create policy "technician manages" on public.compartments    for all to authenticated
  using (public.app_role() = 'technician') with check (public.app_role() = 'technician');

-- Maintenance officers can change an item's status (e.g. back to available).
create policy "maintenance updates items" on public.items for update to authenticated
  using (public.app_role() = 'maintenance') with check (public.app_role() = 'maintenance');

-- Profiles: you see your own; staff see everyone's.
create policy "read own profile" on public.profiles for select to authenticated
  using (id = auth.uid() or public.app_role() in ('technician', 'maintenance'));
create policy "update own profile" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy "technician manages" on public.profiles for all to authenticated
  using (public.app_role() = 'technician') with check (public.app_role() = 'technician');
-- A user may only change their "You're near" zone, never their role or card.
revoke update on public.profiles from authenticated, anon;
grant update (near_zone_id) on public.profiles to authenticated;

-- Reservations and loans: students see their own; technicians see all.
create policy "read own or technician" on public.reservations for select to authenticated
  using (student_id = auth.uid() or public.app_role() = 'technician');
create policy "technician manages" on public.reservations for all to authenticated
  using (public.app_role() = 'technician') with check (public.app_role() = 'technician');

create policy "read own or technician" on public.loans for select to authenticated
  using (student_id = auth.uid() or public.app_role() = 'technician');
create policy "technician manages" on public.loans for all to authenticated
  using (public.app_role() = 'technician') with check (public.app_role() = 'technician');

create policy "technician reads" on public.reservation_attempts for select to authenticated
  using (public.app_role() = 'technician');

-- Fault reports: reporters see and create their own; staff see and manage all.
create policy "read own or staff" on public.fault_reports for select to authenticated
  using (reporter_id = auth.uid() or public.app_role() in ('technician', 'maintenance'));
create policy "report own fault" on public.fault_reports for insert to authenticated
  with check (reporter_id = auth.uid() and status = 'open');
create policy "staff manage" on public.fault_reports for update to authenticated
  using (public.app_role() in ('technician', 'maintenance'))
  with check (public.app_role() in ('technician', 'maintenance'));

-- Maintenance records: staff only.
create policy "staff manage" on public.maintenance_records for all to authenticated
  using (public.app_role() in ('technician', 'maintenance'))
  with check (public.app_role() in ('technician', 'maintenance'));
