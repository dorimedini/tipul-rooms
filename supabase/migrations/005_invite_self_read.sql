-- Allow authenticated users to read their own invite row so the proxy can
-- create their profile when they log in after being invited retroactively.
create policy "users can read own invite"
  on invited_emails for select to authenticated
  using (lower(email) = lower(auth.email()));
