-- Add admin flag and login tracking to profiles
alter table profiles
  add column is_admin boolean not null default false,
  add column last_login_at timestamptz;

-- Invited emails: admin pre-registers users by email
create table invited_emails (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  invited_by uuid references profiles(id) on delete set null,
  is_admin boolean not null default false,
  created_at timestamptz default now()
);

-- Seed the bootstrap admin (must exist before the trigger is needed)
insert into invited_emails (email, is_admin)
values ('i.b.dori@gmail.com', true);

-- Helper: is the current user an admin?
create function is_admin()
returns boolean language sql security definer stable as $$
  select coalesce(
    (select is_admin from profiles where id = auth.uid()),
    false
  )
$$;

-- Update last_login_at for the current user (called from the app on page load)
create function touch_last_login()
returns void language sql security definer as $$
  update profiles set last_login_at = now() where id = auth.uid();
$$;

-- Rewrite the signup trigger: only create profile if email is invited
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  invite invited_emails%ROWTYPE;
begin
  select * into invite from invited_emails where lower(email) = lower(new.email);
  if not found then
    return new; -- silently block: auth user created, but no profile
  end if;

  insert into profiles (id, name, email, is_admin)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.email,
    invite.is_admin
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- RLS for invited_emails: only admins can read/write
alter table invited_emails enable row level security;

create policy "admin read invited_emails"
  on invited_emails for select to authenticated
  using (is_admin());

create policy "admin insert invited_emails"
  on invited_emails for insert to authenticated
  with check (is_admin());

create policy "admin delete invited_emails"
  on invited_emails for delete to authenticated
  using (is_admin());

-- Tighten profile update policy: only admins can flip is_admin
-- Regular users can still update their own name (future use), but not is_admin
drop policy if exists "update own profile" on profiles;

create policy "update own non-admin fields"
  on profiles for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and (
      -- allow if not changing is_admin, or if caller is admin
      is_admin = (select is_admin from profiles where id = auth.uid())
      or is_admin()
    )
  );

create policy "admin update any profile"
  on profiles for update to authenticated
  using (is_admin());
