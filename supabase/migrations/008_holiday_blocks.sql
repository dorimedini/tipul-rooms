-- Manually-added holiday blocks. Unlike room_hours, these are global: one block
-- closes every room in every location for its time range on that date.
--
-- Creating a block cancels the bookings it covers (handled in the API), and new
-- recurring bookings skip the occurrences that land on one.

create table holiday_blocks (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  start_time time not null,
  end_time time not null,
  title text not null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now(),
  constraint holiday_blocks_times_check check (end_time > start_time)
);

create index on holiday_blocks (date);

alter table holiday_blocks enable row level security;

create policy "authenticated read holiday_blocks"
  on holiday_blocks for select to authenticated using (true);

create policy "admin manage holiday_blocks"
  on holiday_blocks for all to authenticated
  using (is_admin()) with check (is_admin());
