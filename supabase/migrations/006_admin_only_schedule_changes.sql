-- Only admins may change the schedule. Every registered user can still read it.
--
-- allocations.user_id is the booking's owner — the therapist the slot is for.
-- It is data on the booking, chosen by the admin who creates it, and no longer
-- implies any permission over it.
--
-- The one exception is swapping, which stays peer-to-peer: while a swap_request
-- is pending, its two participants may update the two allocations it names.

create or replace function can_swap_allocation(alloc_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1
    from swap_requests sr
    join allocations tgt on tgt.id = sr.target_allocation_id
    where sr.status = 'pending'
      and alloc_id in (sr.requester_allocation_id, sr.target_allocation_id)
      and (sr.requester_id = auth.uid() or tgt.user_id = auth.uid())
  )
$$;

-- ── allocations ──────────────────────────────────────────────────────────────
drop policy if exists "insert allocations" on allocations;
create policy "insert allocations" on allocations for insert to authenticated
  with check (is_admin() and exists (select 1 from profiles where profiles.id = user_id));

drop policy if exists "update own allocations" on allocations;
drop policy if exists "update allocations" on allocations;
create policy "update allocations" on allocations for update to authenticated
  using (is_admin() or can_swap_allocation(id));

drop policy if exists "delete own allocations" on allocations;
drop policy if exists "delete allocations" on allocations;
create policy "delete allocations" on allocations for delete to authenticated
  using (is_admin());

-- ── allocation_series (swaps never touch series) ─────────────────────────────
drop policy if exists "insert allocation_series" on allocation_series;
create policy "insert allocation_series" on allocation_series for insert to authenticated
  with check (is_admin() and exists (select 1 from profiles where profiles.id = user_id));

drop policy if exists "update own allocation_series" on allocation_series;
drop policy if exists "update allocation_series" on allocation_series;
create policy "update allocation_series" on allocation_series for update to authenticated
  using (is_admin());

drop policy if exists "delete own allocation_series" on allocation_series;
drop policy if exists "delete allocation_series" on allocation_series;
create policy "delete allocation_series" on allocation_series for delete to authenticated
  using (is_admin());
