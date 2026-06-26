-- Working hours per room per weekday
-- No row for a given day = room is closed that day
create table room_hours (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  open_time time not null,
  close_time time not null,
  constraint room_hours_times_check check (close_time > open_time),
  unique (room_id, day_of_week)
);

alter table room_hours enable row level security;

create policy "authenticated read room_hours"
  on room_hours for select to authenticated using (true);

create policy "admin manage room_hours"
  on room_hours for all to authenticated
  using (is_admin()) with check (is_admin());

-- Allow admins to insert/update/delete locations and rooms
create policy "admin manage locations"
  on locations for all to authenticated
  using (is_admin()) with check (is_admin());

create policy "admin manage rooms"
  on rooms for all to authenticated
  using (is_admin()) with check (is_admin());
