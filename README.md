# Tipul Rooms

Room scheduling web app for therapists.

## Setup

### 1. Supabase project

1. Create a free project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run `supabase/migrations/001_initial_schema.sql`
3. Go to **Authentication → Providers**, enable **Google** and paste your Google OAuth credentials
   - Create credentials at [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → Credentials → OAuth 2.0 Client ID
   - Authorized redirect URI: `https://<your-supabase-project>.supabase.co/auth/v1/callback`

### 2. Environment

```bash
cp .env.local.example .env.local
```

Fill in from **Project Settings → API** in Supabase:
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

### 3. Seed locations and rooms

Run this SQL in Supabase SQL Editor (adjust to your actual locations/rooms):

```sql
insert into locations (name) values ('Tel Aviv'), ('Jerusalem');

insert into rooms (location_id, name)
select id, 'Room 1' from locations where name = 'Tel Aviv'
union all
select id, 'Room 2' from locations where name = 'Tel Aviv'
union all
select id, 'Room A' from locations where name = 'Jerusalem';
```

### 4. Run locally

```bash
npm install
npm run dev
```

### 5. Deploy to Vercel

```bash
npx vercel
```

Set the two env vars in the Vercel dashboard, then add `https://your-app.vercel.app` to Supabase **Authentication → URL Configuration → Redirect URLs**.

## Features

- Weekly calendar view per location, rooms as columns
- Book a room (single or recurring weekly)
- Cancel a single occurrence, or all future occurrences in a series
- Move all future occurrences to a new room/time (with collision warnings for skipped dates)
- Swap requests between therapists (request → accept/decline flow)
