-- Locations
create table locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

-- Rooms
create table rooms (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);

-- User profiles (mirrors auth.users)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null,
  created_at timestamptz default now()
);

-- Allocation series (recurring weekly pattern)
create table allocation_series (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  room_id uuid not null references rooms(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6), -- 0=Sun
  start_time time not null,
  duration_minutes int not null check (duration_minutes >= 30 and duration_minutes % 5 = 0),
  series_start date not null,
  series_end date not null,
  created_at timestamptz default now()
);

-- Individual allocations (one per occurrence, materialized from series)
create table allocations (
  id uuid primary key default gen_random_uuid(),
  series_id uuid references allocation_series(id) on delete set null,
  user_id uuid not null references profiles(id) on delete cascade,
  room_id uuid not null references rooms(id) on delete cascade,
  date date not null,
  start_time time not null,
  duration_minutes int not null check (duration_minutes >= 30 and duration_minutes % 5 = 0),
  status text not null default 'active' check (status in ('active', 'cancelled')),
  created_at timestamptz default now(),
  -- prevent double-booking: same room, same date, overlapping times
  -- enforced via app logic + unique partial index below
  unique (room_id, date, start_time)
);

-- Swap requests
create table swap_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references profiles(id) on delete cascade,
  requester_allocation_id uuid not null references allocations(id) on delete cascade,
  target_allocation_id uuid not null references allocations(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz default now()
);

-- Indexes
create index on allocations (date);
create index on allocations (room_id, date);
create index on allocations (user_id, date);
create index on allocations (series_id);

-- RLS
alter table locations enable row level security;
alter table rooms enable row level security;
alter table profiles enable row level security;
alter table allocation_series enable row level security;
alter table allocations enable row level security;
alter table swap_requests enable row level security;

-- All authenticated users can read locations and rooms
create policy "authenticated read locations" on locations for select to authenticated using (true);
create policy "authenticated read rooms" on rooms for select to authenticated using (true);

-- Profiles readable by all authenticated users, writable by owner
create policy "read profiles" on profiles for select to authenticated using (true);
create policy "insert own profile" on profiles for insert to authenticated with check (id = auth.uid());
create policy "update own profile" on profiles for update to authenticated using (id = auth.uid());

-- Allocation series: readable by all, writable by owner
create policy "read allocation_series" on allocation_series for select to authenticated using (true);
create policy "insert allocation_series" on allocation_series for insert to authenticated with check (user_id = auth.uid());
create policy "update own allocation_series" on allocation_series for update to authenticated using (user_id = auth.uid());
create policy "delete own allocation_series" on allocation_series for delete to authenticated using (user_id = auth.uid());

-- Allocations: readable by all, writable by owner
create policy "read allocations" on allocations for select to authenticated using (true);
create policy "insert allocations" on allocations for insert to authenticated with check (user_id = auth.uid());
create policy "update own allocations" on allocations for update to authenticated using (user_id = auth.uid());
create policy "delete own allocations" on allocations for delete to authenticated using (user_id = auth.uid());

-- Swap requests: visible to requester and target owner
create policy "read own swap_requests" on swap_requests for select to authenticated
  using (
    requester_id = auth.uid()
    or exists (
      select 1 from allocations a where a.id = target_allocation_id and a.user_id = auth.uid()
    )
  );
create policy "insert swap_requests" on swap_requests for insert to authenticated
  with check (requester_id = auth.uid());
create policy "update swap_requests" on swap_requests for update to authenticated
  using (
    requester_id = auth.uid()
    or exists (
      select 1 from allocations a where a.id = target_allocation_id and a.user_id = auth.uid()
    )
  );

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.email
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();
