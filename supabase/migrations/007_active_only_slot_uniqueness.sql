-- The table constraint on (room_id, date, start_time) applied to every row,
-- cancelled ones included, while the app only ever treats *active* bookings as
-- conflicts. A cancelled booking therefore made its slot permanently unbookable:
-- the app saw no conflict, and the insert then failed on the constraint.
--
-- Replaced with the partial index 001 described but never created.

alter table allocations drop constraint if exists allocations_room_id_date_start_time_key;

create unique index if not exists allocations_active_slot_key
  on allocations (room_id, date, start_time)
  where status = 'active';
